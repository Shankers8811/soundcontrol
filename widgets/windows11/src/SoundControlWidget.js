/**
 * SoundControl Widget UI Component
 * 
 * Displays battery and ANC status for Soundcore devices.
 * Communicates with the main Electron app via a local HTTP/WebSocket connection.
 */

export class SoundControlWidget {
  constructor(context) {
    this.context = context;
    this.element = null;
    this.updateInterval = null;
    this.deviceData = {
      name: 'No device',
      leftBattery: null,
      rightBattery: null,
      caseBattery: null,
      ancMode: 'unknown',
      connected: false
    };
  }

  /**
   * Start listening for updates from the main app
   */
  startListening() {
    // Try to connect to the local bridge
    this.fetchData();
    
    // Set up periodic updates
    this.updateInterval = setInterval(() => {
      this.fetchData();
    }, 10000); // Update every 10 seconds
  }

  /**
   * Fetch data from the local bridge
   */
  async fetchData() {
    try {
      // First check if bridge is running
      const healthResponse = await fetch('http://127.0.0.1:8765/health', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + this.getBridgeToken()
        }
      });

      if (!healthResponse.ok) {
        this.updateUI({ connected: false });
        return;
      }

      // Get device list
      const scanResponse = await fetch('http://127.0.0.1:8765/scan', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + this.getBridgeToken()
        }
      });

      if (scanResponse.ok) {
        const data = await scanResponse.json();
        if (data.devices && data.devices.length > 0) {
          // Use the first connected device or first device
          const device = data.devices.find(d => d.connected) || data.devices[0];
          
          // Get detailed battery info by connecting
          if (device.mac) {
            await this.fetchDeviceDetails(device.mac, device.name);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch widget data:', error);
      this.updateUI({ connected: false });
    }
  }

  /**
   * Fetch detailed device information
   */
  async fetchDeviceDetails(mac, name) {
    try {
      // This would require a WebSocket connection to get real-time data
      // For now, we'll use the scan data
      this.updateUI({
        connected: true,
        name: name,
        leftBattery: null, // Would come from WebSocket
        rightBattery: null,
        caseBattery: null,
        ancMode: 'unknown'
      });
    } catch (error) {
      console.error('Failed to fetch device details:', error);
    }
  }

  /**
   * Get the bridge token from localStorage or prompt
   */
  getBridgeToken() {
    // In a real implementation, this would be passed from the main app
    // For now, return empty string (will fail auth but shows structure)
    return localStorage.getItem('soundcontrol_bridge_token') || '';
  }

  /**
   * Update the widget UI
   */
  updateUI(data) {
    this.deviceData = { ...this.deviceData, ...data };
    this.render();
  }

  /**
   * Render the widget UI
   */
  render() {
    if (!this.element) {
      this.element = this.createElement();
      this.context.setContent(this.element);
    }

    const { name, leftBattery, rightBattery, caseBattery, ancMode, connected } = this.deviceData;

    if (!connected) {
      this.element.innerHTML = this.getDisconnectedHTML();
      return;
    }

    this.element.innerHTML = this.getConnectedHTML(name, leftBattery, rightBattery, caseBattery, ancMode);
  }

  getDisconnectedHTML() {
    return `
      <div class="widget-container disconnected">
        <div class="widget-header">
          <span class="widget-icon">🎧</span>
          <span class="widget-title">SoundControl</span>
        </div>
        <div class="widget-body">
          <p class="disconnected-message">No device connected</p>
          <p class="disconnected-hint">Open SoundControl to connect</p>
        </div>
      </div>
    `;
  }

  getConnectedHTML(name, left, right, caseBattery, ancMode) {
    const ancIcons = {
      'anc': '🔇',
      'transparency': '🔊',
      'normal': '🔉',
      'adaptive': '🔄',
      'unknown': '❓'
    };

    const ancLabels = {
      'anc': 'ANC',
      'transparency': 'Transparency',
      'normal': 'Normal',
      'adaptive': 'Adaptive',
      'unknown': 'Unknown'
    };

    return `
      <div class="widget-container connected">
        <div class="widget-header">
          <span class="widget-icon">🎧</span>
          <span class="widget-title">${this.escapeHtml(name)}</span>
        </div>
        <div class="widget-body">
          <div class="battery-section">
            <div class="battery-row">
              <span class="battery-label">L</span>
              <div class="battery-bar">
                <div class="battery-fill" style="width: ${left !== null ? left : 0}%"></div>
              </div>
              <span class="battery-value">${left !== null ? left + '%' : '--'}</span>
            </div>
            <div class="battery-row">
              <span class="battery-label">R</span>
              <div class="battery-bar">
                <div class="battery-fill" style="width: ${right !== null ? right : 0}%"></div>
              </div>
              <span class="battery-value">${right !== null ? right + '%' : '--'}</span>
            </div>
            ${this.deviceData.caseBattery !== null ? `
            <div class="battery-row">
              <span class="battery-label">Case</span>
              <div class="battery-bar">
                <div class="battery-fill" style="width: ${caseBattery}%"></div>
              </div>
              <span class="battery-value">${caseBattery}%</span>
            </div>
            ` : ''}
          </div>
          <div class="anc-section">
            <span class="anc-icon">${ancIcons[ancMode] || '❓'}</span>
            <span class="anc-label">${ancLabels[ancMode] || 'Unknown'}</span>
          </div>
        </div>
      </div>
    `;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }
}