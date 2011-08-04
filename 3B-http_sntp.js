// 3B-http_sntp 1.0.0
// Copyright (c) 2011 Andrew Chung, 3Bengals Inc.
// Last modified: 2011-08-03
//
// 3B-http_sntp is freely distributable under the MIT license. (http://www.opensource.org/licenses/mit-license.php)
//
// Portions are inspired or borrowed from:
// Jehiah Czebotar (jehiah@gmail.com, http://jehiah.cz/a/ntp-for-javascript)
//
//
//
// Full MIT License:
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files
// (the "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
// IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
// CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
// TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
//
//
(function() {
  if (typeof(window.threeB) === 'undefined') {
    window.threeB = {};
  }
  window.threeB.http_sntp = (function() {
    var _version            = '1.0.0';
    var _time_estimates     = new Array;
    var _lib_type           = '';
    var _server_host        = '';
    var _local_offset       = null;
    var _local_ts           = null;
    // User configurable parameters
    var _use_cookie         = true;               // TODO: Need to implement check to see if we do a cookie set at all
    var _cookie_name        = 'NTPClockOffset';
    var _cookie_expiration  = 7;                  // 7 days before the cookie expires
    var _accuracy           = 2;                  // Number of server sync requests to average time over
    var _server_url         = '/time_sync';       // Automatically generated URL
    var _resync_interval    = 30;                 // Minimum number of minutes before an external sync can be requested
    var _automatic_resync   = false;              // TODO: Need to implement timer to sync on a schedule

    if (typeof(jQuery) !== 'undefined') {
      _lib_type = 'jQuery';
    }
    else if (typeof(window.MooTools) !== 'undefined') {
      _lib_type = 'Mootools';
    }
    else if (typeof(window.Prototype !== 'undefined')) {
      _lib_type = 'Prototype';
    }
    else {
      // We require one of the JS frameworks above to function
      return null;
    }

    function now() {
      return Math.round(new Date().getTime());
    }
    function parse_response(data, status, xhr) {
      var text;
      switch(_lib_type) {
        case 'Mootools':
          text  = data.responseText;
          break;
        case 'jQuery':
          text  = data;
          break;
        case 'Prototype':
          break;
      }
      var t3    = now();                          // Client receive TS
      var t2    = parseInt(text.split(":")[2]);   // Server send TS
      var t1    = parseInt(text.split(":")[1]);   // Server receive TS
      var t0    = parseInt(text.split(":")[0]);   // Client send TS
      //var rt_delay  = (t3 - t0) - (t1 - t2);      // Round trip network delay
      var offset    = ((t1 - t0) + (t2 - t3))/2.0;
      _time_estimates.push(offset);
      //console.log('Offset: ' + offset + ', Round trip delay: ' + rt_delay);

      // Save the average offset in a cookie for retrieval
      while (_time_estimates.length > _accuracy) {
        _time_estimates.shift();
      }
      if (_time_estimates.length >= _accuracy) {
        var average = 0.0;
        for (var i = 0; i < _time_estimates.length; i++){
          average += _time_estimates[i];
        }
        save_state(Math.round(average/i));
      }
      else{
        get_server_time();
      }
    }
    function get_server_time() {
      if (_server_url == '') {
        return false;
      }
      try {
        switch(_lib_type) {
          case 'Mootools':
            new Ajax.Request(_server_host + _server_url, {
              onSuccess : parse_response,
              method : "get",
              parameters : "t0=" + now() + "type=ms" // Type is milliseconds
            });
            break;
          case 'jQuery':
            jQuery.get(_server_host + _server_url, {
              't0': now(),             // t0 in the time calculation
              'type': 'ms'             // Type is microseconds
            }, parse_response);
            break;
          case 'Prototype':
            break;
        }
      }
      catch(e) {
        return false;
      }
      return true;
    }
    function set_cookie(name,val) {
      var date = new Date();
      date.setTime(date.getTime() + (_cookie_expiration*24*60*60*1000));
      document.cookie = name + '=' + val + ';expires=' + date.toGMTString() + ';path=/';
    }
    function get_cookie(name) {
      var crumbs = document.cookie.split('; ');
      for (var i = 0; i < crumbs.length; i++)
      {
        var crumb = crumbs[i].split('=');
        if (crumb[0] == name && crumb[1] != null)
          return crumb[1];
      }
      return false;
    }
    function save_state(offset) {
      if (_use_cookie) {
        set_cookie(_cookie_name, offset + '|' + window.threeB.http_sntp.svr_time());  // Save offset and the timestamp that 
we are setting it at
      }
      else {
        _local_offset = offset;
        _local_ts     = window.threeB.http_sntp.svr_time();
      }
    }
    function get_state() {
      if (_use_cookie) {
        var cookie  = get_cookie(_cookie_name);
        if (!cookie) {
          return {};
        }
        var crumbs  = cookie.split('|');
        return {
          'offset': crumbs[0],
          'ts': parseInt(crumbs[1], 10)
          };
      }
      else if (_local_offset != null) {
        return {
          'offset': _local_offset,
          'ts': _local_ts
        };
      }
      return {};
    }
    function get_location(href) {
      var l = document.createElement("a");
      l.href = href;
      return l
    }
    // User accessible functions
    return {
      version: function() {
        return _version;
      },
      sync: function() {
        var state = get_state();
        // Check to make sure we do not sync more often than _resync_interval in minutes
        if (state['ts']) {
          try{
            var t = state['ts'];
            var d = window.threeB.http_sntp.svr_time() - t;
            if (d < (1000*60*_resync_interval)) {
              return false;
            }
          }
          catch(e) {}
        }        
        return get_server_time();
      },
      svr_time: function(ts){
        var state = get_state();
        var offset;
        if (!ts)
          ts = now();
        try {
          if (!state['offset'])
            offset = 0;
          else
            offset = state['offset'];
          if (isNaN(parseInt(offset, 10)))
            return ts;
          return ts + parseInt(offset, 10);
        }
        catch(e) {}
        return ts;
      },
      set_options: function(params_hash) {
        // Automatically set multiple options via a parameters hash
        for (var prop in params_hash) {
          switch(prop) {
            case 'use_cookie':
            case 'cookie_name':
            case 'cookie_expiration':
            case 'accuracy':
            case 'server_url':
            case 'resync_interval':
            case 'automatic_resync':
              that['set_' + prop](params_hash[prop]);
              break;
          }
        }
      },
      get_use_cookie: function() {
        return _use_cookie;
      },
      set_use_cookie: function(val) {
        var old_val = _use_cookie;
        _use_cookie = val;
        return old_val;
      },
      get_cookie_name: function() {
        return _cookie_name;
      },
      set_cookie_name: function(val) {
        var old_val = _cookie_name;
        _cookie_name  = val;
        return old_val;
      },
      get_cookie_expiration: function() {
        return _cookie_expiration;
      },
      set_cookie_expiration: function(val) {
        var old_val = _cookie_expiration;
        _cookie_expiration  = val;
        return old_val;
      },
      get_accuracy: function() {
        return _accuracy;
      },
      set_accuracy: function(val) {
        var old_val = _accuracy;
        _accuracy = val;
        return old_val;
      },
      get_server_url: function() {
        return _server_host + _server_url;
      },
      set_server_url: function(val) {
        var old_val = _server_host + _server_url;
        var l = get_location(val);
        if (val[0] != '/') {
          _server_host  = l.protocol + '//' + l.hostname;
        }
        _server_url = l.pathname;
        return old_val;
      },
      get_resync_interval: function() {
        return _resync_interval;
      },
      set_resync_interval: function(val) {
        var old_val = _resync_interval;
        _resync_interval = val;
        return old_val;
      },
      get_automatic_resync: function() {
        return _automatic_resync;
      },
      set_automatic_resync: function(val) {
        var old_val = _automatic_resync;
        _automatic_resync = val;
        return old_val;
      },
      get_time_offset: function() {
        return get_state()['offset'];
      }
    };
  }());
}());
