/**
 * SoundControl Windows 11 Widget Provider
 * 
 * This is the main entry point for the Windows 11 widget.
 * It registers the widget provider and handles widget lifecycle.
 */

import { WidgetProvider, WidgetContext, WidgetSize } from '@microsoft/windows-widgets';
import { SoundControlWidget } from './SoundControlWidget.js';

class SoundControlWidgetProvider extends WidgetProvider {
  constructor() {
    super();
    this.widgetId = 'soundcontrol-widget';
    this.widgetName = 'SoundControl';
    this.widgetDescription = 'Shows battery and ANC status for Soundcore devices';
  }

  /**
   * Called when the widget is created
   */
  onCreateWidget(context: WidgetContext) {
    console.log('SoundControl widget created');
    
    // Create the widget UI
    const widget = new SoundControlWidget(context);
    
    // Set up widget properties
    context.setWidgetSize(WidgetSize.Medium);
    context.setWidgetTitle('SoundControl');
    
    // Start listening for updates from the main app
    widget.startListening();
    
    return widget;
  }

  /**
   * Called when the widget is destroyed
   */
  onDestroyWidget(context: WidgetContext) {
    console.log('SoundControl widget destroyed');
  }

  /**
   * Called when the widget size changes
   */
  onWidgetSizeChanged(context: WidgetContext, size: WidgetSize) {
    console.log(`Widget size changed to: ${size}`);
  }
}

// Register the widget provider
const provider = new SoundControlWidgetProvider();
provider.register();

export { SoundControlWidgetProvider };