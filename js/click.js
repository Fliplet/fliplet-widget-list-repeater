/**
 * Click Event Handler Modification
 *
 * This script modifies the behavior of click event handling in both jQuery and native JavaScript.
 * Its main purpose is to prevent multiple executions of click event handlers.
 *
 * Key features:
 * 1. Modifies jQuery.fn.on to wrap click event handlers with a '_handled' flag check.
 * 2. Modifies addEventListener to set a '_handled' flag after executing click event listeners.
 *
 * Implications:
 * - Prevents click events from being handled multiple times.
 * - Affects all jQuery click event bindings and native addEventListener calls for click events.
 * - May interfere with scripts or libraries that rely on standard event behavior.
 *
 */

// Check if jQuery is available
if (typeof jQuery !== "undefined") {
  // Store the original jQuery.fn.on method
  const originalOn = jQuery.fn.on;

  // Decorate jQuery.fn.on method
  jQuery.fn.on = function (events, selector, data, handler) {
    // If the event is 'click', wrap the handler
    if (typeof events === "string" && events.includes("click")) {
      const originalHandler =
        typeof selector === "function" ? selector : handler;

      const wrappedHandler = function (event) {
        if (!event._handled) {
          event._handled = true;
          return originalHandler.apply(this, arguments);
        }
      };

      // Call the original .on() method with the wrapped handler
      if (typeof selector === "function") {
        return originalOn.call(this, events, wrappedHandler, data);
      } else {
        return originalOn.call(this, events, selector, data, wrappedHandler);
      }
    }

    // For non-click events, use the original .on() method
    return originalOn.apply(this, arguments);
  };
}

// Decorate addEventListener function to add flag once some registered action is triggered
const originalAddEventListener = EventTarget.prototype.addEventListener;

EventTarget.prototype.addEventListener = function (type, listener, options) {
  if (type === "click") {
    originalAddEventListener.call(
      this,
      type,
      function (event) {
        listener(event);
        event._handled = true;
      },
      options
    );
  } else {
    originalAddEventListener.call(this, type, listener, options);
  }
};
