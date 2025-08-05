window.DEBUG_MODE = (function () {
  var lastPeerId = null;
  var peer = null; // Own peer object
  var peerId = null;
  var conn = null;
  var date = new Date();
  let statusDiv;
  var keyTimeout;
  var burstString = `?bust=${date.getDate()}.${date.getMonth()}.${date.getHours()}`;
  window.overRideConsole = false;

  var MESSAGE_TYPE = {
    COMMAND_INPUT: "COMMAND_INPUT",
    COMMAND_OUPUT: "COMMAND_OUPUT",
    REMOTE_KEY: "REMOTE_KEY",
    CONSOLE_LOG: "CONSOLE_LOG",
    CONSOLE_ERROR: "CONSOLE_ERROR",
    CONSOLE_INFO: "CONSOLE_INFO",
    CONSOLE_WARN: "CONSOLE_WARN",
  };

  let keyCodeArray = [];
  let eachKeyLength = 9;
  let DEBUG_MODE_ENTER = [9, 8, 7, 6, 5, 4, 3, 2, 1];
  let DEBUG_MODE_EXIT = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  let reverseKeyCodeList = {
    48: 0,
    49: 1,
    50: 2,
    51: 3,
    52: 4,
    53: 5,
    54: 6,
    55: 7,
    56: 8,
    57: 9,
    96: 0,
    97: 1,
    98: 2,
    99: 3,
    100: 4,
    101: 5,
    102: 6,
    103: 7,
    104: 8,
    105: 9,
  };

  function sendConsoleMessage(arrayData, messageType) {
    var fullMessage = "";
    var eachLogMessage;
    for (let i = 0; i < arrayData.length; i++) {
      try {
        if (typeof arrayData[i] !== "string") {
          eachLogMessage = JSON.stringify(arrayData[i]);
        } else {
          eachLogMessage = arrayData[i];
        }
        fullMessage += eachLogMessage;
        if (i < arrayData.length - 1) {
          fullMessage += " , ";
        }
      } catch (err) { }
    }
    try {
      let messageObj = {
        type: messageType,
        value: fullMessage,
      };
      sendMessage(messageObj);
    } catch (err) { }
  }
  var __backupConsole = {};
  var __console = {
    log: function () {
      window.overRideConsole &&
        sendConsoleMessage(arguments, MESSAGE_TYPE.CONSOLE_LOG);
      __backupConsole.log && __backupConsole.log.apply(null, arguments);
    },
    error: function () {
      window.overRideConsole &&
        sendConsoleMessage(arguments, MESSAGE_TYPE.CONSOLE_ERROR);
      __backupConsole.error && __backupConsole.error.apply(null, arguments);
    },
    info: function () {
      window.overRideConsole &&
        sendConsoleMessage(arguments, MESSAGE_TYPE.CONSOLE_INFO);
      __backupConsole.info && __backupConsole.info.apply(null, arguments);
    },
    warn: function () {
      window.overRideConsole &&
        sendConsoleMessage(arguments, MESSAGE_TYPE.CONSOLE_WARN);
      __backupConsole.warn && __backupConsole.warn.apply(null, arguments);
    },
  };

  function overRideConsole(config) {
    config = ["info", "error", "warn"];
    for (var i = 0; i < config.length; i++) {
      let name = config[i];
      if (console[name]) {
        __backupConsole[name] = console[name].bind(null);
        console[name] = __console[name];
      }
    }
  }

  function initialize() {
    overRideConsole();
    window.overRideConsole = true;
    var cpid =
      localStorage.getItem("CPID") ||
      localStorage.getItem("cpcustomerId") ||
      "231018025933483";
    cpid = cpid.replace(/[^\/\d]/g, "");
    // Create own peer object with connection to shared PeerJS server
    peer = new Peer(cpid, {
      debug: 2,
    });

    peer.on("open", function (id) {
      // Workaround for peer.reconnect deleting previous id
      if (peer.id === null) {
        console.info("Received null id from peer open");
        peer.id = lastPeerId;
      } else {
        lastPeerId = peer.id;
      }
      copyToClipboard(peer.id);
      debugUI.addEventListener("click", copyToClipboard.bind(null, peer.id));
      console.info("ID: " + peer.id);
      receiverIdDiv.innerHTML = peer.id;
    });

    peer.on("connection", function (c) {
      // Allow only a single connection
      if (conn && conn.open) {
        c.on("open", function () {
          c.send("Already connected to another client");
          setTimeout(function () {
            c.close();
          }, 500);
        });
        return;
      }

      conn = c;
      console.info("Connected to: " + conn.peer);
      statusDiv.classList.add("online");
      setTimeout(() => {
        handleDomRecording();
      }, 1000);
      ready();
    });

    peer.on("disconnected", function () {
      statusDiv.classList.remove("online");
      console.info("Connection lost. Please reconnect");

      // Workaround for peer.reconnect deleting previous id
      peer.id = lastPeerId;
      peer._lastServerId = lastPeerId;
      peer.reconnect();
    });

    peer.on("close", function () {
      conn = null;
      statusDiv.classList.remove("online");
      console.info("Connection destroyed");
      debugUI && debugUI.remove();
    });

    peer.on("error", function (err) {
      console.info("CATCH ::" + err.message);
    });
  }

  function copyToClipboard(text) {
    var textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    textArea.remove();
  }

  function sendMessage(messageObj) {
    let messageStr = JSON.stringify(messageObj);
    if (conn) {
      conn.send(messageStr);
    }
  }

  function sendNetworkMessage(networkObj) {
    try {
      let messageObj = {
        type: "NETWORK_LOG",
        value: JSON.stringify(networkObj)
      };
      sendMessage(messageObj);
    } catch (err) { }
  }


  function onMessageReceived(messageObj) {
    if (!messageObj) {
      return;
    }
    let messageType = messageObj.type;
    switch (messageType) {
      case MESSAGE_TYPE.COMMAND_INPUT:
        let commandString = messageObj.value;
        executeCommand(commandString);
        break;
      case MESSAGE_TYPE.REMOTE_KEY:
        let remoteKey = messageObj.value;
        if (!remoteKey) {
          return;
        }
        remoteKey = parseInt(remoteKey);
        generateEvent(remoteKey);
        break;
      case MESSAGE_TYPE.COMMAND_OUPUT:
        let commandOutout = messageObj.value;
        console.info("commandOutout ::", commandOutout);
        break;
      case "CLICK_ELEMENT_ID":
        let elementId = messageObj.value;
        if (!elementId) {
          console.info("No Element ID found");
          return;
        }
        let el = document.getElementById(elementId);
        if (el) {
          el.click();
        } else {
          console.info("Element not found");
        }
      default:
        break;
    }
  }

  function ready() {
    conn.on("data", function (data) {
      console.info("Data recieved");
      try {
        let messageObj = JSON.parse(data);
        onMessageReceived(messageObj);
      } catch (err) {
        console.info("Error in Parse :: " + err.message);
      }
    });
    conn.on("close", function () {
      statusDiv.classList.remove("online");
      conn = null;
      debugUI && debugUI.style.displa;
    });
  }

  function createDebugCSS() {
    let CSSText = `
		#debugUI {
			position: fixed;
			top: 4em;
      right: 1em;
      width: 100%;
      z-index: 9999;
      resize: both;
      display: flex;
      justify-content: flex-end;
      align-items: center;
      color: white;
      font-size: 0.8em;
    }

		#receiverIdDiv {
			color: rgb(7, 29, 29);
			font-size: 30px;
      display: none;
		}
    .statusText {
      margin-right: 10px;
      text-shadow: 0 0 2px rgb(0 0 0);
    }

		.statusDiv {
			width: 0.8em;
      height: 0.8em;
      display: inline-block;
      background-color: red;
      border-radius: 50%;
		}
    .online {
      background-color: #13c413;  /* change this to whatever you need */
    }

    #closeButton {
      display: none;
    }
	`;
    let CSSElement = document.createElement("style");
    CSSElement.innerHTML = CSSText;
    let headTag = document.getElementsByTagName("head");
    headTag = headTag[0];
    headTag.appendChild(CSSElement);
  }

  function initializeDebugUI() {
    let debugUI = document.createElement("div");
    debugUI.setAttribute("id", "debugUI");
    let receiverIdDiv = document.createElement("div");
    let connectionStatus = document.createElement("p");
    connectionStatus.innerText = "CONNECTION";
    connectionStatus.classList.add("statusText");
    receiverIdDiv.setAttribute("id", "receiverIdDiv");
    statusDiv = document.createElement("div");
    statusDiv.classList.add("statusDiv");
    let closeButton = document.createElement("button");
    closeButton.setAttribute("id", "closeButton");
    closeButton.innerHTML = "Close";
    closeButton.addEventListener("click", function () {
      debugUI.remove();
    });

    debugUI.appendChild(receiverIdDiv);
    debugUI.appendChild(connectionStatus);
    debugUI.appendChild(statusDiv);
    debugUI.appendChild(closeButton);
    document.body.appendChild(debugUI);
  }

  function loadEachJS(url, cb, nodeId) {
    if (url.indexOf("google") === -1) {
      url = `${url}${burstString}`;
    }
    var head = document.getElementsByTagName("head")[0];
    var s = document.createElement("script");
    if (nodeId) {
      s.id = nodeId;
    }
    s.type = "text/javascript";
    s.src = url;
    var ieCallback = function (el, callback) {
      if (el.readyState === "loaded" || el.readyState === "complete") {
        callback();
      } else {
        setTimeout(function () {
          ieCallback(el, callback);
        }, 50);
      }
    };
    if (typeof cb === "function") {
      if (typeof s.addEventListener !== "undefined") {
        s.addEventListener("load", cb, false);
      } else {
        s.onreadystatechange = function () {
          s.onreadystatechange = null;
          ieCallback(s, cb);
        };
      }
    }
    head.appendChild(s);
  }

  function loadDependency() {
    let fullUrl = "https://unpkg.com/peerjs@1.3.1/dist/peerjs.min.js";
    loadEachJS(fullUrl, function () {
      initialize();
    });
  }

  function exitDebugSession() {
    console.info("exitDebugSession");
    conn && conn.close();
    debugUI && debugUI.remove();
  }

  function startDebugSession() {
    console.info("startDebugSession");
    if (typeof Peer !== "undefined" && debugUI) {
      initialize();
    } else {
      createDebugCSS();
      initializeDebugUI();
      loadDependency();
    }
  }

  function registerKeyDown() {
    document.addEventListener("keydown", onKeyDown);
  }

  function checkDebugModeEnterKey() {
    var isThisKeyMatched = true;
    for (let i = 0; i < keyCodeArray.length; i++) {
      if (keyCodeArray[i] !== DEBUG_MODE_ENTER[i]) {
        isThisKeyMatched = false;
      }
    }
    return isThisKeyMatched;
  }

  function checkDebugModeExitKey() {
    var isThisKeyMatched = true;
    for (let i = 0; i < keyCodeArray.length; i++) {
      if (keyCodeArray[i] !== DEBUG_MODE_EXIT[i]) {
        isThisKeyMatched = false;
      }
    }
    return isThisKeyMatched;
  }

  function checkAnyKeyMatch() {
    if (keyCodeArray.length < eachKeyLength) {
      return;
    }

    let isDebugModeEnterKey = checkDebugModeEnterKey();

    let isDebugModeExitKey = checkDebugModeExitKey();

    if (isDebugModeEnterKey) {
      startDebugSession();
    }
    if (isDebugModeExitKey) {
      exitDebugSession();
    }
  }

  function executeCommand(commandString) {
    console.info("executeCommand :: " + commandString);
    try {
      let commandStringReturnValue = eval(commandString);
      sendCommandOutput(commandStringReturnValue);
    } catch (err) {
      console.info("Error in execution");
    }
  }

  function sendCommandOutput(commandOutout) {
    if (!commandOutout) {
      console.info("Not a Valid Command Output");
      return;
    }
    if (typeof commandOutout !== "string") {
      commandOutout = JSON.stringify(commandOutout);
    }
    let messageObj = {
      type: MESSAGE_TYPE.COMMAND_OUPUT,
      value: commandOutout,
    };
    sendMessage(messageObj);
  }

  function generateEvent(keyCode) {
    console.info("generateEvent :: " + keyCode);
    var customEvent = new KeyboardEvent("keydown", {
      keyCode: keyCode,
      bubbles: true,
      cancelable: true,
      view: window,
    });
    try {
      document.dispatchEvent(customEvent);
    } catch (err) {
      console.info("Catch :: " + err.message);
    }
  }

  function onKeyDown(event) {
    let keyCode = event.keyCode;
    let numberKeyCode = reverseKeyCodeList[keyCode];
    keyTimeout && clearTimeout(keyTimeout);
    if (!numberKeyCode) {
      keyCodeArray = [];
      return;
    }
    if (keyCodeArray.length === eachKeyLength) {
      keyCodeArray.shift();
    }
    keyCodeArray.push(numberKeyCode);
    checkAnyKeyMatch();
    keyTimeout = setTimeout(function () {
      keyCodeArray = [];
    }, 10000);
  }

  function bodyOnload() {
    console.info("body onloaded");
    registerKeyDown();
  }

  function registerBodyOnload() {
    if (document.body) {
      bodyOnload();
    } else {
      window.addEventListener("DOMContentLoaded", bodyOnload);
    }
  }



  function CAPTURE_NETWORK_MODE() {
    if (!window.CAPTURE_NETWORK)
      return;

    // Capture XHR
    const OriginalXHR = window.XMLHttpRequest;

    function InterceptedXHR() {
      const xhr = new OriginalXHR();

      const originalOpen = xhr.open;
      xhr.open = function (method, url, ...args) {
        this._method = method;
        this._url = url;
        return originalOpen.apply(this, [method, url, ...args]);
      }
        ;

      const originalSend = xhr.send;
      xhr.send = function (body) {
        const start = Date.now();
        const log = () => {
          console.log("[XHR]", {
            method: this._method,
            url: this._url,
            status: this.status,
            duration: Date.now() - start,
            response: this.response,
          });
          sendNetworkMessage({
            method: this._method,
            url: this._url,
            status: this.status,
            duration: Date.now() - start,
            response: this.response,
          })
        }
          ;

        this.addEventListener("loadend", log);
        return originalSend.call(this, body);
      }
        ;

      return xhr;
    }

    window.XMLHttpRequest = InterceptedXHR;

    // Capture fetch
    const originalFetch = window.fetch;

    window.fetch = function (...args) {
      const [input, init] = args;
      const method = (init && init.method) || "GET";
      const url = typeof input === "string" ? input : input.url;
      const start = Date.now();

      return originalFetch(...args).then(async (response) => {
        const cloned = response.clone();
        const data = await cloned.text();

        console.log("[FETCH]", {
          method,
          url,
          status: response.status,
          duration: Date.now() - start,
          response: data,
        });
        sendNetworkMessage({
          method,
          url,
          status: response.status,
          duration: Date.now() - start,
          response: data,
        });

        return response;
      }
      );
    }
      ;
  }


  function handleDomRecording() {
    if (typeof rrweb == 'undefined') {
      console.warn('rrweb is not loaded. Skipping DOM recording.');
      return;
    }

    const events = [];

    rrweb.record({
      emit(event) {
        // Save locally
        events.push(event);

        // For now: just log the serialized event
        // console.log('RRWEB Event:', JSON.stringify(event));
        const compressed = LZString.compressToUTF16(JSON.stringify(event));
        sendMessage({
          type: 'DOM_EVENT',
          value: compressed,
        });

        // Optional: Send to WebRTC or fetch server
        // sendEventOverRTC(event); // You’ll add this later
      },
      // Optional privacy settings
      maskAllInputs: false,
      maskTextClass: 'rr-mask', // Add this class to any element you want to hide
    });
  }

  registerBodyOnload();
  return {
    startDebugSession: startDebugSession,
    CAPTURE_NETWORK_MODE: CAPTURE_NETWORK_MODE,
  };
})();



