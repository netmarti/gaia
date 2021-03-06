
'use strict';

function checkDataUsageNotification(settings, usage, callback) {
  var proxy = document.getElementById('message-handler').contentWindow;
  var f = proxy ? proxy.checkDataUsageNotification :
                  window.checkDataUsageNotification;
  return f(settings, usage, callback);
}

function addAlarmTimeout(type, delay) {
  var proxy = document.getElementById('message-handler').contentWindow;
  return proxy.addAlarmTimeout(type, delay);
}

function setNextReset(when, callback) {
  var proxy = document.getElementById('message-handler');
  return proxy ? proxy.contentWindow.setNextReset(when, callback) :
                 window.setNextReset(when, callback);
}

function getTopUpTimeout(callback) {
  var proxy = document.getElementById('message-handler');
  return proxy ? proxy.contentWindow.getTopUpTimeout(callback) :
                 window.getTopUpTimeout(callback);
}

// Next automatic reset date based on user preferences
function updateNextReset(trackingPeriod, value, callback) {
  if (trackingPeriod === 'never') {
    setNextReset(null, callback); // remove any alarm
    return;
  }

  var nextReset, today = new Date();

  // Recalculate with month period
  if (trackingPeriod === 'monthly') {
    var month, year;
    var monthday = parseInt(value, 10);
    month = today.getMonth();
    year = today.getFullYear();
    if (today.getDate() >= monthday) {
      month = (month + 1) % 12;
      if (month === 0) {
        year++;
      }
    }
    nextReset = new Date(year, month, monthday);

  // Recalculate with week period
  } else if (trackingPeriod === 'weekly') {
    var oneDay = 24 * 60 * 60 * 1000;
    var weekday = parseInt(value, 10);
    var daysToTarget = weekday - today.getDay();
    if (daysToTarget <= 0) {
      daysToTarget = 7 + daysToTarget;
    }
    nextReset = new Date();
    nextReset.setTime(nextReset.getTime() + oneDay * daysToTarget);
    toMidnight(nextReset);
  }

  // remove oldAlarm and set the new one
  setNextReset(nextReset, callback);
}

function resetData(onsuccess, onerror) {

  // Get all availabe Interfaces
  var currentSimcardInterface = Common.getCurrentSIMInterface();
  var wifiInterface = Common.getWifiInterface();

  // Ask reset for all available Interfaces
  var wifiClearRequest, mobileClearRequest;
  if (wifiInterface) {
    wifiClearRequest = navigator.mozNetworkStats.clearStats(wifiInterface);
  }
  if (currentSimcardInterface) {
    mobileClearRequest = navigator.mozNetworkStats
                                          .clearStats(currentSimcardInterface);
  }

  var getOnErrorFor = function(networkInterface) {
    return function() {
      wifiClearRequest.onerror = undefined;
      mobileClearRequest.onerror = undefined;
      (typeof onerror === 'function') && onerror(netWorkInterface);
    };
  };

  wifiClearRequest.onerror = getOnErrorFor('wi-Fi');
  mobileClearRequest.onerror = getOnErrorFor('simcard');

  // Set last Reset
  ConfigManager.setOption({ lastDataReset: new Date() });

  // call onsuccess
  if (typeof onsuccess === 'function') {
    onsuccess();
  }
}

function resetTelephony(callback) {
  ConfigManager.setOption({
    lastTelephonyReset: new Date(),
    lastTelephonyActivity: {
      calltime: 0,
      smscount: 0,
      timestamp: new Date()
    }
  }, callback);
}

function logResetDataError(networkInterface) {
  console.log('Error when trying to reset ' + networkInterface + ' interface');
}

function resetAll(callback) {
  resetData(thenResetTelephony, logResetDataError);

  function thenResetTelephony() {
    resetTelephony(callback);
  }
}

function getDataLimit(settings) {
  var multiplier = (settings.dataLimitUnit === 'MB') ?
                   1000000 : 1000000000;
  return settings.dataLimitValue * multiplier;
}

function formatTimeHTML(timestampA, timestampB) {
  function timeElement(content) {
    var time = document.createElement('time');
    time.textContent = content;
    return time;
  }

  var fragment = document.createDocumentFragment();

  // No interval
  if (typeof timestampB === 'undefined') {
    fragment.appendChild(timeElement(Formatting.formatTime(timestampA)));
    return fragment;
  }

  // Same day case
  var dateA = new Date(timestampA);
  var dateB = new Date(timestampB);
  if (dateA.getFullYear() === dateB.getFullYear() &&
      dateA.getMonth() === dateB.getMonth() &&
      dateA.getDay() === dateB.getDay()) {

    return formatTimeHTML(timestampB);
  }

  // Interval
  fragment.appendChild(
    timeElement(Formatting.formatTime(timestampA, _('short-date-format')))
  );
  fragment.appendChild(document.createTextNode(' – '));
  fragment.appendChild(timeElement(Formatting.formatTime(timestampB)));
  return fragment;
}

function localizeWeekdaySelector(selector) {
  var weekStartsOnMonday =
    !!parseInt(navigator.mozL10n.get('weekStartsOnMonday'), 10);
  debug('Week starts on monday?', weekStartsOnMonday);
  var monday = selector.querySelector('.monday');
  var sunday = selector.querySelector('.sunday');
  var list = monday.parentNode;
  if (weekStartsOnMonday) {
    debug('Monday, Tuesday...');
    list.insertBefore(monday, list.childNodes[0]); // monday is the first
    list.appendChild(sunday); // sunday is the last
  } else {
    debug('Sunday, Monday...');
    list.insertBefore(sunday, list.childNodes[0]); // sunday is the first
    list.insertBefore(monday, sunday.nextSibling); // monday is the second
  }
}

var Common = {

  COST_CONTROL_APP: 'app://costcontrol.gaiamobile.org',

  allNetworkInterfaces: {},

  allNetworkInterfaceLoaded: false,

  isValidICCID: function(iccid) {
    return typeof iccid === 'string' && iccid.length;
  },

  // Waits for DOMContentLoaded and messagehandlerready, then call the callback
  waitForDOMAndMessageHandler: function(window, callback) {
    var docState = document.readyState;
    var DOMAlreadyLoaded = docState === 'complete' ||
                           docState === 'interactive';
    var messagesReceived = {
      'DOMContentLoaded': DOMAlreadyLoaded,
      'messagehandlerready': false
    };
    function pendingMessages() {
      var pending = 0;
      !messagesReceived['DOMContentLoaded'] && pending++;
      !messagesReceived['messagehandlerready'] && pending++;
      return pending;
    }
    debug('DOMAlreadyLoaded:', DOMAlreadyLoaded);
    debug('Waiting for', pendingMessages(), 'events to start!');

    function checkReady(evt) {
      debug(evt.type, 'event received!');
      messagesReceived[evt.type] = true;

      // Once all events are received, execute the callback
      if (pendingMessages() === 0) {
        window.removeEventListener('DOMContentLoaded', checkReady);
        window.removeEventListener('messagehandlerready', checkReady);
        debug('DOMContentLoaded and messagehandlerready received. Starting');
        callback();
      }
    }

    window.addEventListener('DOMContentLoaded', checkReady);
    window.addEventListener('messagehandlerready', checkReady);
  },

  // Checks for a SIM change
  checkSIMChange: function(callback, onerror) {
    asyncStorage.getItem('lastSIM', function _compareWithCurrent(lastSIM) {
      var currentSIM = IccHelper.iccInfo.iccid;
      if (currentSIM === null) {
        console.error('Impossible: or we don\'t have SIM (so this method ' +
                      'should not be called) or the RIL is returning null ' +
                      'from time to time when checking ICCID.');

        if (typeof onerror === 'function') {
          onerror();
        }
        return;
      }

      ConfigManager.requestSettings(function _onSettings(settings) {
        if (settings.nextReset) {
          setNextReset(settings.nextReset, callback);
          return;
        }

        if (callback) {
          callback();
        }
      });
    });
  },

  startFTE: function(mode) {
    var iframe = document.getElementById('fte_view');

    window.addEventListener('message', function handler(e) {
      if (e.origin !== Common.COST_CONTROL_APP) {
        return;
      }

      if (e.data.type === 'fte_ready') {
        window.removeEventListener('message', handler);

        iframe.classList.remove('non-ready');
      }
    });

    iframe.src = '/fte.html' + '#' + mode;
  },

  startApp: function() {
    parent.postMessage({
      type: 'fte_finished',
      data: ''
    }, Common.COST_CONTROL_APP);
  },

  closeApplication: function() {
    return setTimeout(function _close() {
      debug('Closing.');
      window.close();
    });
  },

  modalAlert: function(message) {
    alert(message);
  },

  get localize() {
    return navigator.mozL10n.localize;
  },

  // Returns whether exists an nsIDOMNetworkStatsInterfaces object
  // that meet the argument function criteria
  getInterface: function getInterface(findFunction) {
    if (!Common.allNetworkInterfaceLoaded) {
      debug('Network interfaces are not ready yet');
      var header = _('data-usage');
      var msg = _('loading-interface-data');
      this.modalAlert(header + '\n' + msg);
      return;
    }

    if (Common.allNetworkInterfaces) {
      return Common.allNetworkInterfaces.find(findFunction);
    }
  },

  getCurrentSIMInterface: function _getCurrentSIMInterface() {
    var iccId = IccHelper.iccInfo ? IccHelper.iccInfo.iccid : null;

    if (iccId) {
      var findCurrentInterface = function(networkInterface) {
        if (networkInterface.id === iccId) {
          return networkInterface;
        }
      };
      return this.getInterface(findCurrentInterface);
    }
    return undefined;
  },

  getWifiInterface: function _getWifiInterface() {
    var findWifiInterface = function(networkInterface) {
      if (networkInterface.type === navigator.mozNetworkStats.WIFI) {
        return networkInterface;
      }
    };
    return this.getInterface(findWifiInterface);
  },

  loadNetworkInterfaces: function() {
    var networks = navigator.mozNetworkStats.getAvailableNetworks();

    networks.onsuccess = function() {
      Common.allNetworkInterfaces = networks.result;
      Common.allNetworkInterfaceLoaded = true;
    };

    networks.onerror = function() {
      debug('Error when trying to load network interfaces');
    };
  }
};
