/* global Peer */
(function () {
  'use strict';

  var MESSAGE_TYPE = {
    COMMAND_INPUT: 'COMMAND_INPUT',
    COMMAND_OUPUT: 'COMMAND_OUPUT',
    REMOTE_KEY: 'REMOTE_KEY',
    CONSOLE_LOG: 'CONSOLE_LOG',
    CONSOLE_ERROR: 'CONSOLE_ERROR',
    CONSOLE_INFO: 'CONSOLE_INFO',
    CONSOLE_WARN: 'CONSOLE_WARN'
  };

  var connectionStatus = null;
  var receiverIdInput = null;
  var connectButton = null;
  var eachCommandInput = null;
  var eachRemoteInput = null;
  var sendEachCommandButton = null;
  var sendRemoteEventButton = null;
  var clearMessageButton = null;
  var fullScreenButton = null;
  var downloadButton = null;
  var eachCommandResponse = null;

  var lastPeerId = null;
  var peer = null;
  var conn = null;

  function updateStatus(newStatus) {
    if (connectionStatus) {
      connectionStatus.innerHTML = newStatus;
    }
  }

  function updateCommandOutput(commandOutput, type) {
    if (typeof commandOutput === 'object') {
      commandOutput = JSON.stringify(commandOutput, null, 2);
    }
    if (!eachCommandResponse) return;
    if (type === MESSAGE_TYPE.CONSOLE_ERROR) {
      eachCommandResponse.innerHTML += '<p class="log-error"><i class="fas fa-times-circle log-icon"></i> ' +
        commandOutput + '</p>';
    } else if (type === MESSAGE_TYPE.CONSOLE_WARN) {
      eachCommandResponse.innerHTML += '<p class="log-warn"><i class="fas fa-exclamation-triangle log-icon"></i> ' +
        commandOutput + '</p>';
    } else {
      eachCommandResponse.innerHTML += '<p class="log-default">' + commandOutput + ' </p>';
    }
  }
  let replayer;
  let isInitialized = false;
  let buffer = [];

  function onDomEvent(domData) {
    try {
      if (typeof LZString === 'undefined') {
        throw new Error('LZString is not loaded.');
      }

      if (typeof rrwebPlayer === 'undefined') {
        throw new Error('rrwebPlayer is not available.');
      }

      // Decompress and parse event
      var decompressed = LZString.decompressFromUTF16(domData);
      if (!decompressed) {
        throw new Error('Failed to decompress DOM data.');
      }

      var event = JSON.parse(decompressed);
      if (!event || typeof event !== 'object') {
        throw new Error('Invalid event data.');
      }

      // Ensure container exists
      var container = document.getElementById('replay-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'replay-container';
        container.style.height = '100vh';
        container.style.overflow = 'hidden';
        document.body.appendChild(container);
      }

      // Require first event to be full snapshot (type 0)
      if (!isInitialized) {
        // if (buffer.length === 0 && !event.type !== 5) {
        //   console.warn('Waiting for full snapshot event (type 0) to begin playback.', event.type);
        //   return;
        // }

        buffer.push(event);

        if (buffer.length >= 2) {
          replayer = new rrwebPlayer({
            target: container,
            props: {
              events: buffer,
              autoPlay: true,
              controls: true,
              liveMode: true,
              showDebug: true,
              showWarning: true,
              showError: true,
              showInfo: true,
              showConsole: true,
            }
          });

          isInitialized = true;
          setTimeout(() => {
            registerClick();
          }, 2000);
          console.info('rrwebPlayer initialized with', buffer.length, 'events');
        }
      } else {
        // After init, just push new events
        if (replayer && typeof replayer.addEvent === 'function') {
          replayer.addEvent(event);
        } else {
          console.warn('Replayer is not ready to add events.');
        }
      }
    } catch (error) {
      console.error('onDomEvent error:', error);
    }
  };


  function registerClick() {
    if (!replayer) {
      console.warn('Replayer is not initialized yet. Cannot register click events.');
      return;
    }
    var iframe = null;
    if (replayer.iframe) {
      console.info('Replayer iframe already exists. Registering click event listener.');
      iframe = replayer.iframe;
    } else {
      console.info('Registering click event listener on replayer iframe.');
      let replayContainer = document.getElementById('replay-container');
      iframe = replayContainer.querySelector('iframe');
      if (!iframe) {
        console.warn('Replayer iframe not found. Cannot register click events.');
        return;
      }
    }
    if (!iframe) {
      return;
    }
    iframe.contentDocument.addEventListener('click', function (e) {
      var el = e.target;

      // Traverse up to find any element with id
      while (el && !el.id && el !== iframe.contentDocument.body) {
        el = el.parentNode;
      }

      if (el && el.id) {
        console.log('Sending click command for id:', el.id);

        // Broadcast command back to sender
        sendMessage({
          type: 'CLICK_ELEMENT_ID',
          value: el.id
        });

      }
    });
    // pointer-events to allow clicks through the replayer
    iframe.style.pointerEvents = 'auto';
  }

  // Renders a network log entry in a Chrome DevTools-like style
  function updateNetworkOutput(log, type) {
    var tbody = document.getElementById('network-body');
    if (!tbody) return;

    // Create row
    var tr = document.createElement('tr');
    tr.className = 'network-row';

    // URL cell (with ellipsis and tooltip)
    var urlTd = document.createElement('td');
    urlTd.className = 'network-url';
    urlTd.title = log.url || '';
    urlTd.textContent = log.url || '';
    urlTd.style.maxWidth = '260px';
    urlTd.style.overflow = 'hidden';
    urlTd.style.textOverflow = 'ellipsis';
    urlTd.style.whiteSpace = 'nowrap';

    // Method cell
    var methodTd = document.createElement('td');
    methodTd.className = 'network-method';
    methodTd.textContent = log.method || '';
    methodTd.style.fontWeight = 'bold';
    methodTd.style.color = '#1565c0';

    // Status cell (color-coded)
    var statusTd = document.createElement('td');
    statusTd.className = 'network-status status-' + log.status;
    statusTd.textContent = log.status || '';
    if (log.status >= 200 && log.status < 300) {
      statusTd.style.color = '#388e3c';
    } else if (log.status >= 400) {
      statusTd.style.color = '#d32f2f';
    } else {
      statusTd.style.color = '#fbc02d';
    }

    // Type cell
    var typeTd = document.createElement('td');
    typeTd.className = 'network-type';
    typeTd.textContent = type || '';

    // Response cell (show preview, tooltip for full)
    var responseTd = document.createElement('td');
    responseTd.className = 'network-response';
    var resp = log.response;


    try {
      if (typeof resp === 'string') {
        // Try to parse as JSON
        resp = JSON.parse(resp);
      }
    } catch (error) {
      // do nothing
    }
    if (typeof resp === 'object' && resp !== null) {
      // Beautify JSON object
      var pretty = JSON.stringify(resp, null, 2);
      responseTd.title = pretty;

      // Create a collapsible preview for large JSON
      var previewDiv = document.createElement('div');
      previewDiv.className = 'network-response-preview';
      previewDiv.style.whiteSpace = 'pre';
      previewDiv.style.maxHeight = '80px';
      previewDiv.style.overflow = 'auto';
      previewDiv.style.cursor = 'pointer';
      previewDiv.textContent = pretty.length > 600 ? pretty.slice(0, 600) + '…' : pretty;

      // If too long, allow expand/collapse
      if (pretty.length > 600) {
        var expandBtn = document.createElement('span');
        expandBtn.textContent = 'Show more';
        expandBtn.style.color = '#1976d2';
        expandBtn.style.marginLeft = '8px';
        expandBtn.style.cursor = 'pointer';
        expandBtn.style.fontSize = '12px';

        var expanded = false;
        expandBtn.onclick = function () {
          expanded = !expanded;
          if (expanded) {
            previewDiv.textContent = pretty;
            expandBtn.textContent = 'Show less';
            previewDiv.style.maxHeight = '300px';
          } else {
            previewDiv.textContent = pretty.slice(0, 600) + '…';
            expandBtn.textContent = 'Show more';
            previewDiv.style.maxHeight = '80px';
          }
        };

        responseTd.appendChild(previewDiv);
        responseTd.appendChild(expandBtn);
      } else {
        responseTd.appendChild(previewDiv);
      }
    } else {
      resp = resp || '';
      responseTd.title = resp;
      responseTd.textContent = resp.length > 120 ? resp.slice(0, 120) + '…' : resp;
      responseTd.style.whiteSpace = 'pre-line';
      // If too long, allow expand/collapse for string too
      if (resp.length > 120) {
        var expandBtnStr = document.createElement('span');
        expandBtnStr.textContent = 'Show more';
        expandBtnStr.style.color = '#1976d2';
        expandBtnStr.style.marginLeft = '8px';
        expandBtnStr.style.cursor = 'pointer';
        expandBtnStr.style.fontSize = '12px';

        var expandedStr = false;
        expandBtnStr.onclick = function () {
          expandedStr = !expandedStr;
          if (expandedStr) {
            responseTd.textContent = resp;
            expandBtnStr.textContent = 'Show less';
            responseTd.appendChild(expandBtnStr);
          } else {
            responseTd.textContent = resp.slice(0, 120) + '…';
            expandBtnStr.textContent = 'Show more';
            responseTd.appendChild(expandBtnStr);
          }
        };
        responseTd.textContent = resp.slice(0, 120) + '…';
        responseTd.appendChild(expandBtnStr);
      }
    }
    responseTd.style.maxWidth = '220px';
    responseTd.style.overflow = 'hidden';
    responseTd.style.textOverflow = 'ellipsis';

    // Duration cell
    var durationTd = document.createElement('td');
    durationTd.className = 'network-duration';
    durationTd.textContent = log.duration !== undefined ? log.duration + ' ms' : '';

    // Append all cells
    tr.appendChild(urlTd);
    tr.appendChild(methodTd);
    tr.appendChild(statusTd);
    tr.appendChild(typeTd);
    tr.appendChild(responseTd);
    tr.appendChild(durationTd);

    // Add to table body
    tbody.appendChild(tr);
  }

  function updateConsoleOutput(message, type) {
    var log = {
      message: message,
      level: 'log'
    };
    if (type === MESSAGE_TYPE.CONSOLE_INFO) {
      log.level = 'log';
    } else if (type === MESSAGE_TYPE.CONSOLE_WARN) {
      log.level = 'warn';
    } else if (type === MESSAGE_TYPE.CONSOLE_ERROR) {
      log.level = 'error';
    }
    var consoleDiv = document.getElementById('console-body');
    if (!consoleDiv) return;
    var div = document.createElement('div');
    div.className = 'console-' + log.level;
    div.textContent = '[' + log.level.toUpperCase() + '] ' + log.message;
    consoleDiv.appendChild(div);
  }

  function updateStorageOutput(data) {
    var container = document.getElementById('app-storage');
    if (!container) return;
    container.innerHTML = '';

    // Add a nice header
    var header = document.createElement('div');
    header.className = 'storage-header';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.padding = '12px 16px';
    header.style.background = '#f5f5f7';
    header.style.fontWeight = 'bold';
    header.style.borderBottom = '1px solid #e0e0e0';

    var keyHeader = document.createElement('span');
    keyHeader.textContent = 'Key';
    keyHeader.style.flex = '1 1 40%';
    var valueHeader = document.createElement('span');
    valueHeader.textContent = 'Value';
    valueHeader.style.flex = '1 1 60%';

    header.appendChild(keyHeader);
    header.appendChild(valueHeader);
    container.appendChild(header);

    Object.keys(data).forEach(function (key, idx) {
      var row = document.createElement('div');
      row.className = 'storage-row';
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'flex-start';
      row.style.padding = '14px 16px';
      row.style.background = idx % 2 === 0 ? '#fff' : '#fafbfc';
      row.style.borderBottom = '1px solid #f0f0f0';
      row.style.gap = '16px';

      var keySpan = document.createElement('span');
      keySpan.className = 'storage-key';
      keySpan.textContent = key;
      keySpan.style.flex = '1 1 40%';
      keySpan.style.fontWeight = '500';
      keySpan.style.color = '#333';
      keySpan.style.overflow = 'hidden';
      keySpan.style.textOverflow = 'ellipsis';
      keySpan.style.whiteSpace = 'nowrap';

      var valueSpan = document.createElement('span');
      valueSpan.className = 'storage-value';
      valueSpan.textContent = data[key];
      valueSpan.style.flex = '1 1 60%';
      valueSpan.style.color = '#444';
      valueSpan.style.background = '#f8fafd';
      valueSpan.style.borderRadius = '4px';
      valueSpan.style.padding = '6px 10px';
      valueSpan.style.overflowWrap = 'break-word';
      valueSpan.style.wordBreak = 'break-all';
      valueSpan.style.maxHeight = '80px';
      valueSpan.style.overflowY = 'auto';

      row.appendChild(keySpan);
      row.appendChild(valueSpan);
      container.appendChild(row);
    });

    container.style.maxHeight = '340px';
    container.style.overflowY = 'auto';
    container.style.overflowX = 'hidden';
    container.style.border = '1px solid #e0e0e0';
    container.style.borderRadius = '8px';
    container.style.background = '#f9fafb';
    container.style.margin = '12px 0';
    container.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)';
  }

  function sendMessage(messageObj) {
    if (conn && conn.open) {
      var msg = JSON.stringify(messageObj);
      conn.send(msg);
    }
  }

  function sendEachRemoteEvent() {
    var remoteKeyCode = eachRemoteInput && eachRemoteInput.value;
    if (!remoteKeyCode) return;
    var messageObj = {
      type: MESSAGE_TYPE.REMOTE_KEY,
      value: remoteKeyCode
    };
    sendMessage(messageObj);
  }

  function sendEachCommand() {
    var commandName = eachCommandInput && eachCommandInput.value;
    if (!commandName) return;
    var messageObj = {
      type: MESSAGE_TYPE.COMMAND_INPUT,
      value: commandName
    };
    sendMessage(messageObj);
  }

  function clearPastMessage() {
    if (eachCommandResponse) {
      eachCommandResponse.innerHTML = "<span class='response-placeholder'>Response Should Come here</span>";
    }
  }

  function toggleFullScreen() {
    var fullScreenDiv = document.getElementById('fullscreenDiv');
    if (!fullScreenDiv) return;
    var doc = document;
    if (
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement
    ) {
      if (doc.exitFullscreen) {
        doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
      } else if (doc.mozCancelFullScreen) {
        doc.mozCancelFullScreen();
      } else if (doc.msExitFullscreen) {
        doc.msExitFullscreen();
      }
    } else {
      if (fullScreenDiv.requestFullscreen) {
        fullScreenDiv.requestFullscreen();
      } else if (fullScreenDiv.webkitRequestFullscreen) {
        fullScreenDiv.webkitRequestFullscreen();
      } else if (fullScreenDiv.mozRequestFullScreen) {
        fullScreenDiv.mozRequestFullScreen();
      } else if (fullScreenDiv.msRequestFullscreen) {
        fullScreenDiv.msRequestFullscreen();
      }
    }
  }

  function downloadLogs() {
    var pageTitle = document.title;
    var pageUrl = window.location.href;
    var currentTime = new Date().toLocaleString();
    var currentTimeFormatted = currentTime.replace(/\s/g, '_');
    var fileName = pageUrl + '__' + pageTitle + '__' + currentTimeFormatted + '.txt';
    fileName = fileName.replace(/\//g, '_');
    var respponseDiv = document.getElementById('eachCommandResponse');
    var respponseText = respponseDiv && respponseDiv.innerHTML;
    respponseText = respponseText ? respponseText.replace(/<br>/g, '\n') : '';
    respponseText = fileName + '\n' + respponseText;
    var link = document.createElement('a');
    var mimeType = 'text/plain';
    link.setAttribute('download', fileName);
    link.setAttribute(
      'href',
      'data:' + mimeType + ';charset=utf-8,' + encodeURIComponent(respponseText)
    );
    link.click();
  }

  function attachEvents() {
    if (sendEachCommandButton) {
      sendEachCommandButton.addEventListener('click', sendEachCommand);
    }
    if (sendRemoteEventButton) {
      sendRemoteEventButton.addEventListener('click', sendEachRemoteEvent);
    }
    if (connectButton) {
      connectButton.addEventListener('click', startConnection);
    }
    if (clearMessageButton) {
      clearMessageButton.addEventListener('click', clearPastMessage);
    }
    if (fullScreenButton) {
      fullScreenButton.addEventListener('click', toggleFullScreen);
    }
    if (downloadButton) {
      downloadButton.addEventListener('click', downloadLogs);
    }
  }

  function initialize() {
    peer = new Peer(undefined, {
      debug: 2
    });

    peer.on('open', function (id) {
      if (peer.id === null) {
        peer.id = lastPeerId;
      } else {
        lastPeerId = peer.id;
      }
      var newStatus = 'Status:  ' + (peer.open ? 'Open for connection' : 'Connecting...');
      updateStatus(newStatus);
    });

    peer.on('connection', function (c) {
      c.on('open', function () {
        c.send('Sender does not accept incoming connections');
        setTimeout(function () {
          c.close();
        }, 500);
      });
    });

    peer.on('disconnected', function () {
      var newStatus = 'Connection lost. Please reconnect';
      updateStatus(newStatus);
      peer.id = lastPeerId;
      peer._lastServerId = lastPeerId;
      peer.reconnect();
    });

    peer.on('close', function () {
      conn = null;
      var newStatus = 'Connection destroyed. Please refresh';
      updateStatus(newStatus);
    });

    peer.on('error', function (err) {
      // eslint-disable-next-line no-console
      console.error('Error :: ', err);
    });
  }

  function startConnection() {
    if (conn) {
      conn.close();
    }
    if (!peer || !receiverIdInput) return;
    conn = peer.connect(receiverIdInput.value, {
      reliable: true
    });

    conn.on('open', function () {
      var newStatus = 'Connected to: ' + conn.peer;
      updateStatus(newStatus);
    });

    conn.on('data', function (data) {
      try {
        var outputObj = JSON.parse(data);
        var outputType = outputObj.type;
        var outputValue = outputObj.value;
        switch (outputType) {
          case MESSAGE_TYPE.COMMAND_OUPUT:
            if (typeof outputValue === 'string') {
              try {
                outputValue = JSON.parse(outputValue);
              } catch (error) {
                // ignore
              }
            }
            if (outputValue && outputValue.CPID) {
              updateStorageOutput(outputValue);
            } else {
              updateCommandOutput(outputValue, outputType);
            }
            break;
          case 'NETWORK_LOG':
            try {
              var networkObj = JSON.parse(outputValue);
              updateNetworkOutput(networkObj, outputType);
            } catch (error) {
              updateCommandOutput('Invalid network log format: ' + error.message, MESSAGE_TYPE.CONSOLE_ERROR);
            }
            break;
          case MESSAGE_TYPE.CONSOLE_ERROR:
          case MESSAGE_TYPE.CONSOLE_INFO:
          case MESSAGE_TYPE.CONSOLE_WARN:
            updateConsoleOutput(outputValue, outputType);
            break;
          case 'DOM_EVENT':
            onDomEvent(outputValue);
            break;
          default:
            updateCommandOutput(outputValue, outputType);
            break;
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error :: ', err.message);
      }
    });

    conn.on('close', function () {
      var newStatus = 'Connection closed';
      updateStatus(newStatus);
    });
    window.conn = conn;
  }

  function bodyOnload() {
    connectionStatus = document.getElementById('connectionStatus');
    receiverIdInput = document.getElementById('receiverId');
    connectButton = document.getElementById('connectButton');
    eachCommandInput = document.getElementById('eachCommandInput');
    eachRemoteInput = document.getElementById('eachRemoteInput');
    sendRemoteEventButton = document.getElementById('sendRemoteEventButton');
    sendEachCommandButton = document.getElementById('sendEachCommandButton');
    clearMessageButton = document.getElementById('clearMessageButton');
    fullScreenButton = document.getElementById('fullScreenButton');
    downloadButton = document.getElementById('downloadButton');
    eachCommandResponse = document.getElementById('eachCommandResponse');
    attachEvents();
    initialize();
  }

  function registerBodyOnload() {
    if (document.body) {
      bodyOnload();
    } else {
      window.addEventListener('DOMContentLoaded', bodyOnload);
    }
  }

  registerBodyOnload();

  window.APPLICATION = {};

  window.switchTab = function switchTab(tabName) {
    var tabs = document.querySelectorAll('.tab');
    var views = document.querySelectorAll('.view');
    var i;
    for (i = 0; i < tabs.length; i += 1) {
      tabs[i].classList.remove('active');
    }
    for (i = 0; i < views.length; i += 1) {
      views[i].classList.remove('active');
    }
    var tabSelector = '.tab-bar .tab[onclick="switchTab(\'' + tabName + '\')"]';
    var tab = document.querySelector(tabSelector);
    if (tab) {
      tab.classList.add('active');
    }
    var view = document.getElementById(tabName);
    if (view) {
      view.classList.add('active');
    }
  };
}());
