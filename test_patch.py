import sys
sys.path.insert(0, '.')
import socket
import importlib.util
import os
import types

# Create a mock socket module
AF_BLUETOOTH = getattr(socket, "AF_BLUETOOTH", 31)

class FakeSocket:
    def __init__(self, family=-1, type=-1, proto=-1, *args, **kwargs):
        pass
    def settimeout(self, v): pass
    def connect(self, addr): 
        print('connect called:', addr)
        raise OSError(112, 'Host is down')
    def sendall(self, data): print('sendall:', data)
    def recv(self, n): raise socket.timeout()
    def close(self): pass

# Create a mock socket class that returns FakeSocket for Bluetooth
class MockSocketClass:
    def __new__(cls, family=-1, type=-1, proto=-1, *args, **kwargs):
        if family == AF_BLUETOOTH:
            return FakeSocket()
        # For non-Bluetooth, return a minimal object that won't block
        # We can't use real socket because SSL will try to subclass it
        # Return a minimal mock that satisfies basic checks
        return MinimalSocket()

class MinimalSocket:
    """Minimal socket-like object for non-Bluetooth use (e.g., SSL)"""
    def __init__(self, *args, **kwargs): pass
    def settimeout(self, v): pass
    def connect(self, *args, **kwargs): pass
    def sendall(self, data): pass
    def recv(self, n): return b''
    def close(self): pass
    def __getattr__(self, name):
        # Fallback for any attribute access
        return lambda *a, **k: None

# Create a mock socket module - copy everything from real socket first
mock_socket_module = types.ModuleType('socket')
mock_socket_module.__dict__.update(socket.__dict__)
mock_socket_module.socket = MockSocketClass
mock_socket_module.AF_BLUETOOTH = AF_BLUETOOTH
mock_socket_module.BTPROTO_RFCOMM = getattr(socket, "BTPROTO_RFCOMM", 3)
mock_socket_module.SOCK_STREAM = socket.SOCK_STREAM
mock_socket_module.timeout = socket.timeout

# Replace socket module in sys.modules BEFORE importing bridge
sys.modules['socket'] = mock_socket_module

# Now import bridge
import importlib.util
ROOT = 'C:\\Users\\shank\\soundcontrol'
BRIDGE_PATH = os.path.join(ROOT, 'soundcore_bridge.py')
spec = importlib.util.spec_from_file_location('soundcore_bridge', BRIDGE_PATH)
bridge = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(bridge)

print('Bridge loaded')
b = bridge.Bridge()
try:
    b.connect('AA:BB:CC:DD:EE:FF', 4)
    print('Connected')
except Exception as e:
    print('Error:', e)
    import traceback
    traceback.print_exc()