// Loading from node_modules isn't recommended but done here for demonstration purposes.
// PLUS: No need for a bundler like webpack or others
import { BrowserWebSocketTransport } from
  './node_modules/puppeteer-core/lib/esm/puppeteer/common/BrowserWebSocketTransport.js';
import { _connectToCdpBrowser as connect } from
  './node_modules/puppeteer-core/lib/esm/puppeteer/cdp/BrowserConnector.js';

const noop = () => {};

function debounce(func, waitMilliseconds = 50, options = {}) {
  let timeoutId;
  const isImmediate = options.isImmediate ?? false;
  const maxWait = options.maxWait;
  let lastInvokeTime = Date.now();

  function nextInvokeTimeout() {
    if (maxWait !== undefined) {
      const timeSinceLastInvocation = Date.now() - lastInvokeTime;

      if (timeSinceLastInvocation + waitMilliseconds >= maxWait) {
        return maxWait - timeSinceLastInvocation;
      }
    }

    return waitMilliseconds;
  }

  const debouncedFunction = function (...args) {
    const invokeFunction = () => {
      timeoutId = undefined;
      lastInvokeTime = Date.now();
      if (!isImmediate) {
        func.apply(this, args);
      }
    };

    const shouldCallNow = isImmediate && timeoutId === undefined;

    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(invokeFunction, nextInvokeTimeout());

    if (shouldCallNow) {
      func.apply(this, args);
    }
  };

  debouncedFunction.cancel = function cancel() {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  };

  return debouncedFunction;
}

class HybridPuppeteer {
  browserWSEndpoint = '';
  url = '';
  quality = 100;

  width = window.innerWidth;
  height = window.innerHeight;
  img = new Image();

  $canvas = null;
  $ctx = null;
  browser = null;
  page = null;

  constructor(browserWSEndpoint, url, quality) {
    this.browserWSEndpoint = browserWSEndpoint;
    this.url = url;
    this.quality = quality ?? 100;

    this.setup();
  }

  static cdpOptions = {
    headers: {
      Host: '127.0.0.1',
    },
  };

  static getModifiersForEvent(event) {
    return (
      (event.altKey ? 1 : 0) |
      (event.ctrlKey ? 2 : 0) |
      (event.metaKey ? 4 : 0) |
      (event.shiftKey ? 8 : 0)
    );
  }

  async setup() {
    const connectionTransport = await BrowserWebSocketTransport.create(
      this.browserWSEndpoint,
    );

    this.browser = await connect(
      connectionTransport,
      this.browserWSEndpoint,
      HybridPuppeteer.cdpOptions,
    );

    this.browser.once('disconnect', this.removeEventListeners);
    this.page = await this.browser.newPage();
    this.cdp = this.page._client.call(this.page);

    await this.page.goto(this.url);

    this.$canvas = document.querySelector('#display');
    this.$ctx = this.$canvas.getContext('2d');

    this.$canvas.click();
    this.$canvas.focus();
    this.$canvas.width = this.width;
    this.$canvas.height = this.height;

    this.start();
  }

  async start() {
    this.resizePage();
    this.addListeners();
    this.cdp.on('Page.screencastFrame', this.onScreencastFrame);

    await this.cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: this.quality,
    });
  }

  resizePage = debounce(() => {
    const { innerHeight: height, innerWidth: width } = window;

    this.$canvas.width = width;
    this.$canvas.height = height;

    this.page.setViewport({
      deviceScaleFactor: 1,
      height: Math.floor(height),
      width: Math.floor(width),
    });
  }, 200);

  emitMouse = (evt) => {
    const buttons = { 0: 'none', 1: 'left', 2: 'middle', 3: 'right' };
    const event = evt.type === 'mousewheel' ? window.event || evt : evt;
    const types = {
      mousedown: 'mousePressed',
      mousemove: 'mouseMoved',
      mouseup: 'mouseReleased',
      mousewheel: 'mouseWheel',
      touchend: 'mouseReleased',
      touchmove: 'mouseWheel',
      touchstart: 'mousePressed',
    };

    if (!(event.type in types)) {
      return;
    }

    if (
      event.type !== 'mousewheel' &&
      buttons[event.which] === 'none' &&
      event.type !== 'mousemove'
    ) {
      return;
    }

    const type = types[event.type];
    const isScroll = type.indexOf('wheel') !== -1;
    const x = isScroll ? event.clientX : event.offsetX;
    const y = isScroll ? event.clientY : event.offsetY;

    const data = {
      button: event.type === 'mousewheel' ? 'none' : buttons[event.which],
      clickCount: 1,
      modifiers: HybridPuppeteer.getModifiersForEvent(event),
      type: types[event.type],
      x,
      y,
    };

    if (event.type === 'mousewheel') {
      data.deltaX = event.wheelDeltaX || 0;
      data.deltaY = event.wheelDeltaY || event.wheelDelta;
    }

    this.cdp.send('Input.emulateTouchFromMouseEvent', data);
  };

  emitKeyEvent = (event) => {
    let type;

    // Prevent backspace from going back in history
    if (event.keyCode === 8) {
      event.preventDefault();
    }

    switch (event.type) {
      case 'keydown':
        type = 'keyDown';
        break;
      case 'keyup':
        type = 'keyUp';
        break;
      case 'keypress':
        type = 'char';
        break;
      default:
        return;
    }

    if (type === 'keyDown' && event.code !== 'Backspace') {
      return;
    }

    const text =
      type === 'char' ? String.fromCharCode(event.charCode) : undefined;

    const data = {
      autoRepeat: false,
      code: event.code,
      isKeypad: false,
      isSystemKey: false,
      key: event.key,
      keyIdentifier: event.keyIdentifier,
      nativeVirtualKeyCode: event.keyCode,
      text,
      type,
      unmodifiedText: text ? text.toLowerCase() : undefined,
      windowsVirtualKeyCode: event.keyCode,
    };

    this.cdp.send('Input.dispatchKeyEvent', data);
  };

  onScreencastFrame = ({ data, sessionId }) => {
    this.cdp.send('Page.screencastFrameAck', { sessionId }).catch(noop);
    this.img.onload = () =>
      this.$ctx.drawImage(
        this.img,
        0,
        0,
        this.$canvas.width,
        this.$canvas.height,
      );
    this.img.src = 'data:image/png;base64,' + data;
  };

  bindKeyEvents = () => {
    document.body.addEventListener('keydown', this.emitKeyEvent, true);
    document.body.addEventListener('keyup', this.emitKeyEvent, true);
    document.body.addEventListener('keypress', this.emitKeyEvent, true);
  };

  unbindKeyEvents = () => {
    document.body.removeEventListener('keydown', this.emitKeyEvent, true);
    document.body.removeEventListener('keyup', this.emitKeyEvent, true);
    document.body.removeEventListener('keypress', this.emitKeyEvent, true);
  };

  addListeners = () => {
    this.$canvas.addEventListener('mousedown', this.emitMouse, false);
    this.$canvas.addEventListener('mouseup', this.emitMouse, false);
    this.$canvas.addEventListener('mousewheel', this.emitMouse, false);
    this.$canvas.addEventListener('mousemove', this.emitMouse, false);

    this.$canvas.addEventListener('mouseenter', this.bindKeyEvents, false);
    this.$canvas.addEventListener('mouseleave', this.unbindKeyEvents, false);

    window.addEventListener('resize', this.resizePage);
  };

  removeEventListeners = () => {
    this.$canvas.removeEventListener('mousedown', this.emitMouse, false);
    this.$canvas.removeEventListener('mouseup', this.emitMouse, false);
    this.$canvas.removeEventListener('mousewheel', this.emitMouse, false);
    this.$canvas.removeEventListener('mousemove', this.emitMouse, false);

    this.$canvas.removeEventListener('mouseenter', this.bindKeyEvents, false);
    this.$canvas.removeEventListener('mouseleave', this.unbindKeyEvents, false);

    window.removeEventListener('resize', this.resizePage);
  };
}

const params = new URL(window.location.href);
const browserWSEndpoint = params.searchParams.get('browserWSEndpoint');
const url = params.searchParams.get('url');
const quality = params.searchParams.get('quality') ?? 100;

new HybridPuppeteer(browserWSEndpoint, url, quality);
