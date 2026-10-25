"""
BlueZ D-Bus integration for Linux Bluetooth device discovery, pairing, and RFCOMM.
This module provides a pure Python implementation using the dbus-python library
to interact with BlueZ via D-Bus, replacing the shell-based `bluetoothctl` approach.
"""

import sys
import os
import asyncio
import subprocess
from typing import Optional, List, Dict, Any, Callable, Awaitable
from dataclasses import dataclass, field
from contextlib import contextmanager
from typing import TYPE_CHECKING

# Define shared types inline to avoid dependency on TypeScript modules
@dataclass
class DeviceProfile:
    """Represents a device profile for Soundcore devices."""
    id: str
    name: str
    sku: str
    kind: str
    family: str
    gaming: bool
    ancLevels: bool
    scenes: bool
    ldac: bool
    dual: bool
    surround: bool
    wind: bool
    transparency: bool
    batteryMax: int
    names: List[str]
    ancLayout: str
    batteryMax: int
    batteryOffset: int = 0
    eqCommand: Optional[str] = None
    customEq: bool = False
    caseBatteryMax: Optional[int] = None
    caseBatteryOffset: int = 0
    state: Any = None
    source: str = ""
    verified: bool = False

@dataclass
class BatteryState:
    """Represents battery state for a device."""
    left: Optional[int] = None
    right: Optional[int] = None
    case: Optional[int] = None
    leftCharging: Optional[bool] = None
    rightCharging: Optional[bool] = None
    caseCharging: Optional[bool] = None


if TYPE_CHECKING:
    import dbus
    import dbus.mainloop.glib
    from gi.repository import GLib
    DBUS_AVAILABLE = True
else:
    try:
        import dbus
        import dbus.mainloop.glib
        from gi.repository import GLib
        DBUS_AVAILABLE = True
    except ImportError:
        DBUS_AVAILABLE = False
        dbus = None
        GLib = None

if DBUS_AVAILABLE:
    import dbus
    import dbus.mainloop.glib
    from gi.repository import GLib
else:
    dbus = None
    GLib = None
    DBUS_AVAILABLE = False

from typing import Optional, List, Dict, Any, Callable, Awaitable
from dataclasses import dataclass, field
from contextlib import contextmanager


@dataclass
class BlueZDevice:
    """Represents a BlueZ device object."""
    path: str
    address: str
    name: Optional[str] = None
    alias: Optional[str] = None
    paired: bool = False
    connected: bool = False
    trusted: bool = False
    legacy_pairing: bool = False
    rssi: Optional[int] = None
    tx_power: Optional[int] = None
    services_resolved: bool = False
    uuids: List[str] = field(default_factory=list)
    adapter_path: Optional[str] = None
    properties: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        # Parse MAC address from object path if not provided
        if self.path and not self.address:
            # Object path format: /org/bluez/hci0/dev_XX_XX_XX_XX_XX_XX
            parts = self.path.split('_')
            if len(parts) >= 6:
                self.address = ':'.join(parts[-6:]).upper()


if DBUS_AVAILABLE:
    import dbus
    import dbus.mainloop.glib
    from gi.repository import GLib
    import dbus.service
    import dbus.mainloop.glib
    from gi.repository import GLib
    import asyncio

    class BlueZManager:
        """
        High-level interface to BlueZ via D-Bus.
        Provides device discovery, pairing, connection, and RFCOMM service discovery.
        """

        def __init__(self, bus: Optional[dbus.SystemBus] = None):
            self.bus = bus or dbus.SystemBus()
            self.adapter_path: Optional[str] = None
            self.adapter_proxy: Optional[dbus.Interface] = None
            self.adapter_props: Optional[dbus.Interface] = None
            self.agent_manager: Optional[dbus.Interface] = None
            self.mainloop: Optional[GLib.MainLoop] = None
            self._devices: Dict[str, BlueZDevice] = {}
            self._device_added_callback: Optional[Callable[[BlueZDevice], None]] = None
            self._device_removed_callback: Optional[Callable[[str], None]] = None
            self._device_changed_callback: Optional[Callable[[BlueZDevice], None]] = None
            self._discovery_active = False
            self._discovery_filter: Optional[Dict[str, Any]] = None

            # Known Soundcore UUIDs
            self.SOUNDCORE_DSP_SERVICE_UUID = "0CF12D31-FAC3-4553-BD80-D6832E7B3958"
            self.RFCOMM_SERVICE_CLASS_UUID = "00001101-0000-1000-8000-00805F9B34FB"

            self._initialize()

        def _initialize(self):
            """Initialize BlueZ D-Bus connections."""
            # Find the first Bluetooth adapter
            om = dbus.Interface(self.bus.get_object("org.bluez", "/"),
                               "org.freedesktop.DBus.ObjectManager")
            objects = om.GetManagedObjects()

            for path, interfaces in objects.items():
                if "org.bluez.Adapter1" in interfaces:
                    self.adapter_path = path
                    self.adapter_proxy = dbus.Interface(
                        self.bus.get_object("org.bluez", path),
                        "org.bluez.Adapter1"
                    )
                    self.adapter_props = dbus.Interface(
                        self.bus.get_object("org.bluez", path),
                        "org.freedesktop.DBus.Properties"
                    )
                    break

            if not self.adapter_path:
                raise RuntimeError("No Bluetooth adapter found")

            # Get agent manager
            self.agent_manager = dbus.Interface(
                self.bus.get_object("org.bluez", "/org/bluez"),
                "org.bluez.AgentManager1"
            )

            # Set up signal handlers
            self.bus.add_signal_receiver(
                self._on_interfaces_added,
                signal_name="InterfacesAdded",
                dbus_interface="org.freedesktop.DBus.ObjectManager",
                bus_name="org.bluez"
            )
            self.bus.add_signal_receiver(
                self._on_interfaces_removed,
                signal_name="InterfacesRemoved",
                dbus_interface="org.freedesktop.DBus.ObjectManager",
                bus_name="org.bluez"
            )
            self.bus.add_signal_receiver(
                self._on_properties_changed,
                signal_name="PropertiesChanged",
                dbus_interface="org.freedesktop.DBus.Properties",
                bus_name="org.bluez"
            )

            # Initialize device list
            self._refresh_devices()

        def _refresh_devices(self):
            """Refresh the device cache from BlueZ."""
            om = dbus.Interface(self.bus.get_object("org.bluez", "/"),
                               "org.freedesktop.DBus.ObjectManager")
            objects = om.GetManagedObjects()

            self._devices = {}
            for path, interfaces in objects.items():
                if "org.bluez.Device1" in interfaces:
                    device = self._parse_device(path, interfaces["org.bluez.Device1"])
                    if device:
                        self._devices[device.address] = device

        def _parse_device(self, path: str, props: Dict[str, Any]) -> Optional[BlueZDevice]:
            """Parse a BlueZ Device1 interface into a BlueZDevice object."""
            address = str(props.get("Address", ""))
            if not address:
                # Parse from path
                parts = path.split('_')
                if len(parts) >= 6:
                    address = ':'.join(parts[-6:]).upper()

            if not address:
                return None

            return BlueZDevice(
                path=path,
                address=address,
                name=str(props.get("Name", "") or ""),
                alias=str(props.get("Alias", "") or ""),
                paired=bool(props.get("Paired", False)),
                connected=bool(props.get("Connected", False)),
                trusted=bool(props.get("Trusted", False)),
                legacy_pairing=bool(props.get("LegacyPairing", False)),
                rssi=int(props.get("RSSI", 0)) if props.get("RSSI") else None,
                tx_power=int(props.get("TxPower", 0)) if props.get("TxPower") else None,
                services_resolved=bool(props.get("ServicesResolved", False)),
                uuids=[str(u) for u in props.get("UUIDs", [])],
                adapter_path=str(props.get("Adapter", "")),
                properties={k: str(v) for k, v in props.items()}
            )

        def _on_interfaces_added(self, path: str, interfaces: Dict[str, Dict[str, Any]]):
            """Handle new D-Bus interfaces added."""
            if "org.bluez.Device1" in interfaces:
                device = self._parse_device(path, interfaces["org.bluez.Device1"])
                if device:
                    self._devices[device.address] = device
                    if self._device_added_callback:
                        self._device_added_callback(device)

        def _on_interfaces_removed(self, path: str, interfaces: List[str]):
            """Handle D-Bus interfaces removed."""
            if "org.bluez.Device1" in interfaces:
                # Find device by path
                for addr, device in list(self._devices.items()):
                    if device.path == path:
                        del self._devices[addr]
                        if self._device_removed_callback:
                            self._device_removed_callback(addr)
                        break

        def _on_properties_changed(self, interface: str, changed: Dict[str, Any],
                                   removed: List[str], path: str):
            """Handle D-Bus properties changed signal."""
            if interface != "org.bluez.Device1":
                return

            if path in [d.path for d in self._devices.values()]:
                device = next(d for d in self._devices.values() if d.path == path)
                # Update device properties
                for key, value in changed.items():
                    if hasattr(device, key.lower()):
                        setattr(device, key.lower(), value)

                if self._device_changed_callback:
                    self._device_changed_callback(device)

        # ---------------------------------------------------------------------
        # Public API
        # ---------------------------------------------------------------------

        @property
        def adapter_address(self) -> Optional[str]:
            """Get the Bluetooth adapter MAC address."""
            if self.adapter_props:
                return str(self.adapter_props.Get("org.bluez.Adapter1", "Address"))
            return None

        @property
        def is_powered(self) -> bool:
            if self.adapter_props:
                return bool(self.adapter_props.Get("org.bluez.Adapter1", "Powered"))
            return False

        def set_powered(self, powered: bool) -> None:
            """Enable/disable the Bluetooth adapter."""
            if self.adapter_props:
                self.adapter_props.Set("org.bluez.Adapter1", "Powered", dbus.Boolean(powered))

        def is_discovering(self) -> bool:
            if self.adapter_props:
                return bool(self.adapter_props.Get("org.bluez.Adapter1", "Discovering"))
            return False

        async def start_discovery(self, filter_uuids: Optional[List[str]] = None,
                                  transport: str = "auto") -> None:
            """Start device discovery."""
            if self._discovery_active:
                return

            if self.adapter_props:
                filter_dict = {}
                if filter_uuids:
                    filter_dict["UUIDs"] = dbus.Array(filter_uuids, signature='s')
                if transport != "auto":
                    filter_dict["Transport"] = transport

                if filter_dict:
                    self.adapter_proxy.SetDiscoveryFilter(filter_dict)

                await asyncio.get_event_loop().run_in_executor(
                    None, lambda: self.adapter_proxy.StartDiscovery()
                )
                self._discovery_active = True
                self._discovery_filter = filter_dict or None

        async def stop_discovery(self) -> None:
            """Stop device discovery."""
            if not self._discovery_active:
                return

            if self.adapter_proxy:
                await asyncio.get_event_loop().run_in_executor(
                    None, lambda: self.adapter_proxy.StopDiscovery()
                )
            self._discovery_active = False
            self._discovery_filter = None

        def get_devices(self, connected_only: bool = False) -> List[BlueZDevice]:
            """Get list of known devices."""
            devices = list(self._devices.values())
            if connected_only:
                devices = [d for d in devices if d.connected]
            return devices

        def get_device(self, address: str) -> Optional[BlueZDevice]:
            """Get a device by MAC address."""
            return self._devices.get(address.upper())

        async def pair(self, address: str) -> bool:
            """Pair with a device."""
            device = self.get_device(address)
            if not device:
                raise ValueError(f"Device {address} not found")

            device_proxy = self.bus.get_object("org.bluez", device.path)
            device_iface = dbus.Interface(device_proxy, "org.bluez.Device1")

            try:
                await asyncio.get_event_loop().run_in_executor(
                    None, lambda: device_iface.Pair()
                )
                return True
            except dbus.DBusException as e:
                raise RuntimeError(f"Pairing failed: {e}")

        async def unpair(self, address: str) -> bool:
            """Unpair a device."""
            device = self.get_device(address)
            if not device:
                raise ValueError(f"Device {address} not found")

            adapter_proxy = self.bus.get_object("org.bluez", self.adapter_path)
            adapter_iface = dbus.Interface(adapter_proxy, "org.bluez.Adapter1")

            try:
                await asyncio.get_event_loop().run_in_executor(
                    None, lambda: adapter_iface.RemoveDevice(device.path)
                )
                return True
            except dbus.DBusException as e:
                raise RuntimeError(f"Unpairing failed: {e}")

        async def connect_device(self, address: str) -> bool:
            """Connect to a device."""
            device = self.get_device(address)
            if not device:
                raise ValueError(f"Device {address} not found")

            device_proxy = self.bus.get_object("org.bluez", device.path)
            device_iface = dbus.Interface(device_proxy, "org.bluez.Device1")

            try:
                await asyncio.get_event_loop().run_in_executor(
                    None, lambda: device_iface.Connect()
                )
                return True
            except dbus.DBusException as e:
                raise RuntimeError(f"Connection failed: {e}")

        async def disconnect_device(self, address: str) -> bool:
            """Disconnect from a device."""
            device = self.get_device(address)
            if not device:
                raise ValueError(f"Device {address} not found")

            device_proxy = self.bus.get_object("org.bluez", device.path)
            device_iface = dbus.Interface(device_proxy, "org.bluez.Device1")

            try:
                await asyncio.get_event_loop().run_in_executor(
                    None, lambda: device_iface.Disconnect()
                )
                return True
            except dbus.DBusException as e:
                raise RuntimeError(f"Disconnection failed: {e}")

        async def get_rfcomm_services(self, address: str) -> List[Dict[str, Any]]:
            """Get RFCOMM services for a device."""
            device = self.get_device(address)
            if not device:
                raise ValueError(f"Device {address} not found")

            if not device.services_resolved:
                device_proxy = self.bus.get_object("org.bluez", device.path)
                device_iface = dbus.Interface(device_proxy, "org.bluez.Device1")
                await asyncio.get_event_loop().run_in_executor(
                    None, lambda: device_iface.Connect()
                )
                # Wait for services to be resolved
                for _ in range(50):
                    await asyncio.sleep(0.1)
                    if device.services_resolved:
                        break

            device_proxy = self.bus.get_object("org.bluez", device.path)
            services = []

            om = dbus.Interface(self.bus.get_object("org.bluez", "/"),
                               "org.freedesktop.DBus.ObjectManager")
            objects = om.GetManagedObjects()

            for path, interfaces in objects.items():
                if path.startswith(device.path) and "org.bluez.GattService1" in interfaces:
                    service_props = interfaces["org.bluez.GattService1"]
                    service_uuid = str(service_props.get("UUID", ""))
                    primary = bool(service_props.get("Primary", True))

                    services.append({
                        "uuid": service_uuid,
                        "primary": primary,
                        "path": path
                    })

            return services

        async def connect_rfcomm(self, address: str, service_uuid: str) -> Any:
            """Connect to an RFCOMM service on a device."""
            device = self.get_device(address)
            if not device:
                raise ValueError(f"Device {address} not found")

            # Get RFCOMM service
            device_proxy = self.bus.get_object("org.bluez", device.path)
            device_iface = dbus.Interface(device_proxy, "org.bluez.Device1")

            # Get RFCOMM service
            om = dbus.Interface(self.bus.get_object("org.bluez", "/"),
                               "org.freedesktop.DBus.ObjectManager")
            objects = om.GetManagedObjects()

            rfcomm_path = None
            for path, interfaces in objects.items():
                if path.startswith(device.path) and "org.bluez.Rfcomm1" in interfaces:
                    props = interfaces["org.bluez.Rfcomm1"]
                    uuid = str(props.get("UUID", ""))
                    if uuid.upper() == service_uuid.upper():
                        rfcomm_path = path
                        break

            if not rfcomm_path:
                raise RuntimeError(f"RFCOMM service {service_uuid} not found on device")

            # Connect to RFCOMM
            rfcomm_proxy = self.bus.get_object("org.bluez", rfcomm_path)
            rfcomm_iface = dbus.Interface(rfcomm_proxy, "org.bluez.Rfcomm1")

            await asyncio.get_event_loop().run_in_executor(
                None, lambda: rfcomm_iface.Acquire()
            )

            # Return the stream socket file descriptor
            # Note: In practice, you'd use the fd directly or use a library like pybluez
            return rfcomm_path

        def get_services(self, address: str) -> List[Dict[str, Any]]:
            """Get all GATT services for a device (sync version)."""
            device = self.get_device(address)
            if not device:
                raise ValueError(f"Device {address} not found")

            device_proxy = self.bus.get_object("org.bluez", device.path)
            services = []

            om = dbus.Interface(self.bus.get_object("org.bluez", "/"),
                               "org.freedesktop.DBus.ObjectManager")
            objects = om.GetManagedObjects()

            for path, interfaces in objects.items():
                if path.startswith(device.path) and "org.bluez.GattService1" in interfaces:
                    service_props = interfaces["org.bluez.GattService1"]
                    service_uuid = str(service_props.get("UUID", ""))
                    primary = bool(service_props.get("Primary", True))

                    services.append({
                        "uuid": service_uuid,
                        "primary": primary,
                        "path": path
                    })

            return services

        def get_rfcomm_service_channel(self, address: str, service_uuid: str) -> Optional[int]:
            """Get RFCOMM channel number for a service (synchronous, using bluetoothctl fallback)."""
            # This is a fallback implementation using bluetoothctl
            # The D-Bus API doesn't directly expose channel numbers
            import subprocess
            try:
                result = subprocess.run(
                    ["bluetoothctl", "info", address],
                    capture_output=True, text=True, timeout=5
                )
                for line in result.stdout.split('\n'):
                    if 'RFCOMM' in line and service_uuid.upper() in line.upper():
                        # Parse channel from output
                        parts = line.split()
                        for part in parts:
                            if part.isdigit():
                                return int(part)
            except Exception:
                pass
            return None

        def _refresh_devices(self):
            """Refresh the device cache from BlueZ."""
            om = dbus.Interface(self.bus.get_object("org.bluez", "/"),
                               "org.freedesktop.DBus.ObjectManager")
            objects = om.GetManagedObjects()

            self._devices = {}
            for path, interfaces in objects.items():
                if "org.bluez.Device1" in interfaces:
                    device = self._parse_device(path, interfaces["org.bluez.Device1"])
                    if device:
                        self._devices[device.address] = device

        def _parse_device(self, path: str, props: Dict[str, Any]) -> Optional[BlueZDevice]:
            """Parse a BlueZ Device1 interface into a BlueZDevice object."""
            address = str(props.get("Address", ""))
            if not address:
                # Parse from path
                parts = path.split('_')
                if len(parts) >= 6:
                    address = ':'.join(parts[-6:]).upper()

            if not address:
                return None

            return BlueZDevice(
                path=path,
                address=address,
                name=str(props.get("Name", "") or ""),
                alias=str(props.get("Alias", "") or ""),
                paired=bool(props.get("Paired", False)),
                connected=bool(props.get("Connected", False)),
                trusted=bool(props.get("Trusted", False)),
                legacy_pairing=bool(props.get("LegacyPairing", False)),
                rssi=int(props.get("RSSI", 0)) if props.get("RSSI") else None,
                tx_power=int(props.get("TxPower", 0)) if props.get("TxPower") else None,
                services_resolved=bool(props.get("ServicesResolved", False)),
                uuids=[str(u) for u in props.get("UUIDs", [])],
                adapter_path=str(props.get("Adapter", "")),
                properties={k: str(v) for k, v in props.items()}
            )

        def _on_interfaces_added(self, path: str, interfaces: Dict[str, Dict[str, Any]]):
            """Handle new D-Bus interfaces added."""
            if "org.bluez.Device1" in interfaces:
                device = self._parse_device(path, interfaces["org.bluez.Device1"])
                if device:
                    self._devices[device.address] = device
                    if self._device_added_callback:
                        self._device_added_callback(device)

        def _on_interfaces_removed(self, path: str, interfaces: List[str]):
            """Handle D-Bus interfaces removed."""
            if "org.bluez.Device1" in interfaces:
                # Find device by path
                for addr, device in list(self._devices.items()):
                    if device.path == path:
                        del self._devices[addr]
                        if self._device_removed_callback:
                            self._device_removed_callback(addr)
                        break

        def _on_properties_changed(self, interface: str, changed: Dict[str, Any],
                                   removed: List[str], path: str):
            """Handle D-Bus properties changed signal."""
            if interface != "org.bluez.Device1":
                return

            if path in [d.path for d in self._devices.values()]:
                device = next(d for d in self._devices.values() if d.path == path)
                # Update device properties
                for key, value in changed.items():
                    if hasattr(device, key.lower()):
                        setattr(device, key.lower(), value)

                if self._device_changed_callback:
                    self._device_changed_callback(device)

        # ---------------------------------------------------------------------
        # Public API
        # ---------------------------------------------------------------------

        @property
        def adapter_address(self) -> Optional[str]:
            """Get the Bluetooth adapter MAC address."""
            if self.adapter_props:
                return str(self.adapter_props.Get("org.bluez.Adapter1", "Address"))
            return None

        @property
        def is_powered(self) -> bool:
            if self.adapter_props:
                return bool(self.adapter_props.Get("org.bluez.Adapter1", "Powered"))
            return False

        def set_powered(self, powered: bool) -> None:
            """Enable/disable the Bluetooth adapter."""
            if self.adapter_props:
                self.adapter_props.Set("org.bluez.Adapter1", "Powered", dbus.Boolean(powered))

        def is_discovering(self) -> bool:
            if self.adapter_props:
                return bool(self.adapter_props.Get("org.bluez.Adapter1", "Discovering"))
            return False

        async def start_discovery(self, filter_uuids: Optional[List[str]] = None,
                                  transport: str = "auto") -> None:
            """Start device discovery."""
            if self._discovery_active:
                return

            if self.adapter_props:
                filter_dict = {}
                if filter_uuids:
                    filter_dict["UUIDs"] = dbus.Array(filter_uuids, signature='s')
                if transport != "auto":
                    filter_dict["Transport"] = transport

                if filter_dict:
                    self.adapter_proxy.SetDiscoveryFilter(filter_dict)

                await asyncio.get_event_loop().run_in_executor(
                    None, lambda: self.adapter_proxy.StartDiscovery()
                )
                self._discovery_active = True
                self._discovery_filter = filter_dict or None

        async def stop_discovery(self) -> None:
            """Stop device discovery."""
            if not self._discovery_active:
                return

            if self.adapter_proxy:
                await asyncio.get_event_loop().run_in_executor(
                    None, lambda: self.adapter_proxy.StopDiscovery()
                )
            self._discovery_active = False
            self._discovery_filter = None

        def get_devices(self, connected_only: bool = False) -> List[BlueZDevice]:
            """Get list of known devices."""
            devices = list(self._devices.values())
            if connected_only:
                devices = [d for d in devices if d.connected]
            return devices

        def get_device(self, address: str) -> Optional[BlueZDevice]:
            """Get a device by MAC address."""
            return self._devices.get(address.upper())

        async def pair(self, address: str) -> bool:
            """Pair with a device."""
            device = self.get_device(address)
            if not device:
                raise ValueError(f"Device {address} not found")

            device_proxy = self.bus.get_object("org.bluez", device.path)
            device_iface = dbus.Interface(device_proxy, "org.bluez.Device1")

            try:
                await asyncio.get_event_loop().run_in_executor(
                    None, lambda: device_iface.Pair()
                )
                return True
            except dbus.DBusException as e:
                raise RuntimeError(f"Pairing failed: {e}")

        async def unpair(self, address: str) -> bool:
            """Unpair a device."""
            device = self.get_device(address)
            if not device:
                raise ValueError(f"Device {address} not found")

            adapter_proxy = self.bus.get_object("org.bluez", self.adapter_path)
            adapter_iface = dbus.Interface(adapter_proxy, "org.bluez.Adapter1")

            try:
                await asyncio.get_event_loop().run_in_executor(
                    None, lambda: adapter_iface.RemoveDevice(device.path)
                )
                return True
            except dbus.DBusException as e:
                raise RuntimeError(f"Unpairing failed: {e}")

        async def connect_device(self, address: str) -> bool:
            """Connect to a device."""
            device = self.get_device(address)
            if not device:
                raise ValueError(f"Device {address} not found")

            device_proxy = self.bus.get_object("org.bluez", device.path)
            device_iface = dbus.Interface(device_proxy, "org.bluez.Device1")

            try:
                await asyncio.get_event_loop().run_in_executor(
                    None, lambda: device_iface.Connect()
                )
                return True
            except dbus.DBusException as e:
                raise RuntimeError(f"Connection failed: {e}")

        async def disconnect_device(self, address: str) -> bool:
            """Disconnect from a device."""
            device = self.get_device(address)
            if not device:
                raise ValueError(f"Device {address} not found")

            device_proxy = self.bus.get_object("org.bluez", device.path)
            device_iface = dbus.Interface(device_proxy, "org.bluez.Device1")

            try:
                await asyncio.get_event_loop().run_in_executor(
                    None, lambda: device_iface.Disconnect()
                )
                return True
            except dbus.DBusException as e:
                raise RuntimeError(f"Disconnection failed: {e}")

        async def get_rfcomm_services(self, address: str) -> List[Dict[str, Any]]:
            """Get RFCOMM services for a device."""
            device = self.get_device(address)
            if not device:
                raise ValueError(f"Device {address} not found")

            if not device.services_resolved:
                device_proxy = self.bus.get_object("org.bluez", device.path)
                device_iface = dbus.Interface(device_proxy, "org.bluez.Device1")
                await asyncio.get_event_loop().run_in_executor(
                    None, lambda: device_iface.Connect()
                )
                # Wait for services to be resolved
                for _ in range(50):
                    await asyncio.sleep(0.1)
                    if device.services_resolved:
                        break

            device_proxy = self.bus.get_object("org.bluez", device.path)
            services = []

            om = dbus.Interface(self.bus.get_object("org.bluez", "/"),
                               "org.freedesktop.DBus.ObjectManager")
            objects = om.GetManagedObjects()

            for path, interfaces in objects.items():
                if path.startswith(device.path) and "org.bluez.GattService1" in interfaces:
                    service_props = interfaces["org.bluez.GattService1"]
                    service_uuid = str(service_props.get("UUID", ""))
                    primary = bool(service_props.get("Primary", True))

                    services.append({
                        "uuid": service_uuid,
                        "primary": primary,
                        "path": path
                    })

            return services

        async def connect_rfcomm(self, address: str, service_uuid: str) -> Any:
            """Connect to an RFCOMM service on a device."""
            device = self.get_device(address)
            if not device:
                raise ValueError(f"Device {address} not found")

            # Get RFCOMM service
            device_proxy = self.bus.get_object("org.bluez", device.path)
            device_iface = dbus.Interface(device_proxy, "org.bluez.Device1")

            # Get RFCOMM service
            om = dbus.Interface(self.bus.get_object("org.bluez", "/"),
                               "org.freedesktop.DBus.ObjectManager")
            objects = om.GetManagedObjects()

            rfcomm_path = None
            for path, interfaces in objects.items():
                if path.startswith(device.path) and "org.bluez.Rfcomm1" in interfaces:
                    props = interfaces["org.bluez.Rfcomm1"]
                    uuid = str(props.get("UUID", ""))
                    if uuid.upper() == service_uuid.upper():
                        rfcomm_path = path
                        break

            if not rfcomm_path:
                raise RuntimeError(f"RFCOMM service {service_uuid} not found on device")

            # Connect to RFCOMM
            rfcomm_proxy = self.bus.get_object("org.bluez", rfcomm_path)
            rfcomm_iface = dbus.Interface(rfcomm_proxy, "org.bluez.Rfcomm1")

            await asyncio.get_event_loop().run_in_executor(
                None, lambda: rfcomm_iface.Acquire()
            )

            # Return the stream socket file descriptor
            # Note: In practice, you'd use the fd directly or use a library like pybluez
            return rfcomm_path

        def get_services(self, address: str) -> List[Dict[str, Any]]:
            """Get all GATT services for a device (sync version)."""
            device = self.get_device(address)
            if not device:
                raise ValueError(f"Device {address} not found")

            device_proxy = self.bus.get_object("org.bluez", device.path)
            services = []

            om = dbus.Interface(self.bus.get_object("org.bluez", "/"),
                               "org.freedesktop.DBus.ObjectManager")
            objects = om.GetManagedObjects()

            for path, interfaces in objects.items():
                if path.startswith(device.path) and "org.bluez.GattService1" in interfaces:
                    service_props = interfaces["org.bluez.GattService1"]
                    service_uuid = str(service_props.get("UUID", ""))
                    primary = bool(service_props.get("Primary", True))

                    services.append({
                        "uuid": service_uuid,
                        "primary": primary,
                        "path": path
                    })

            return services

        def get_rfcomm_service_channel(self, address: str, service_uuid: str) -> Optional[int]:
            """Get RFCOMM channel number for a service (synchronous, using bluetoothctl fallback)."""
            # This is a fallback implementation using bluetoothctl
            # The D-Bus API doesn't directly expose channel numbers
            import subprocess
            try:
                result = subprocess.run(
                    ["bluetoothctl", "info", address],
                    capture_output=True, text=True, timeout=5
                )
                for line in result.stdout.split('\n'):
                    if 'RFCOMM' in line and service_uuid.upper() in line.upper():
                        # Parse channel from output
                        parts = line.split()
                        for part in parts:
                            if part.isdigit():
                                return int(part)
            except Exception:
                pass
            return None

        # ------------------------------------------------------------------------
        # Pairing Agent Implementation
        # ------------------------------------------------------------------------

        class PairingAgent:
            """BlueZ pairing agent implementation."""

            def __init__(self, bus: dbus.SystemBus, path: str,
                         capability: str = "NoInputNoOutput"):
                self.bus = bus
                self.path = path
                self.capability = capability
                self._agent = None
                self._register()

            def _register(self):
                """Register the agent with BlueZ."""
                self._agent = self.bus.get_object("org.bluez", "/org/bluez")
                agent_manager = dbus.Interface(self.bus.get_object("org.bluez", "/org/bluez"),
                                               "org.bluez.AgentManager1")
                agent_manager.RegisterAgent(self.path, self.capability)
                # Create the agent object
                self._agent = dbus.service.Object(self.bus, self.path,
                    introspection_data="""
                    <node>
                        <interface name="org.bluez.Agent1">
                            <method name="RequestPinCode">
                                <arg name="device" type="o" direction="in"/>
                                <arg name="pincode" type="s" direction="out"/>
                            </method>
                            <method name="DisplayPinCode">
                                <arg name="device" type="o" direction="in"/>
                                <arg name="pincode" type="s" direction="in"/>
                            </method>
                            <method name="RequestPasskey">
                                <arg name="device" type="o" direction="in"/>
                                <arg name="passkey" type="u" direction="out"/>
                            </method>
                            <method name="DisplayPasskey">
                                <arg name="device" type="o" direction="in"/>
                                <arg name="passkey" type="u" direction="in"/>
                                <arg name="entered" type="q" direction="in"/>
                            </method>
                            <method name="RequestConfirmation">
                                <arg name="device" type="o" direction="in"/>
                                <arg name="passkey" type="u" direction="in"/>
                            </method>
                            <method name="RequestAuthorization">
                                <arg name="device" type="o" direction="in"/>
                            </method>
                            <method name="AuthorizeService">
                                <arg name="device" type="o" direction="in"/>
                                <arg name="uuid" type="s" direction="in"/>
                            </method>
                            <method name="Cancel">
                            </method>
                        </interface>
                    </node>
                    """)

            def RequestPinCode(self, device: str) -> str:
                return "0000"

            def DisplayPinCode(self, device: str, pincode: str):
                pass

            def RequestPasskey(self, device: str) -> int:
                return 0

            def DisplayPasskey(self, device: str, passkey: int, entered: int):
                pass

            def RequestConfirmation(self, device: str, passkey: int) -> None:
                pass

            def RequestAuthorization(self, device: str) -> None:
                pass

            def AuthorizeService(self, device: str, uuid: str) -> None:
                pass

            def Cancel(self):
                pass

            def unregister(self):
                """Unregister the agent."""
                bus = dbus.SystemBus()
                agent_manager = dbus.Interface(
                    bus.get_object("org.bluez", "/org/bluez"),
                    "org.bluez.AgentManager1"
                )
                agent_manager.UnregisterAgent(self.path)


else:
    # Dummy classes when DBUS_AVAILABLE is False
    class BlueZManager:
        def __init__(self, *args, **kwargs):
            raise RuntimeError("BlueZ integration requires dbus-python and python-gobject. "
                              "Install with: pip install dbus-python pygobject")

    class BlueZDevice:
        pass

    DBUS_AVAILABLE = False


# Export main classes
__all__ = [
    "BlueZDevice",
    "BlueZManager",
    "PairingAgent",
    "get_paired_devices",
    "scan_devices",
    "get_rfcomm_service_channel",
    "DBUS_AVAILABLE",
]