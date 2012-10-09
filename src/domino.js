(function(window) {
  'use strict';

  var _startTime = new Date();

  // Check domino.js existance:
  if (window.domino) {
    throw new Error('domino already exists');
  }

  /**
   * The constructor of any domino.js instance.
   *
   * @constructor
   * @extends domino.EventDispatcher
   * @this {domino}
   */
  window.domino = function() {
    dispatcher.call(this);

    // Misc:
    var _self = this,
        _utils = domino.utils,
        _type = _utils.type;

    // Properties management:
    var _types = {},
        _labels = {},
        _events = {},
        _getters = {},
        _setters = {},
        _statics = {},
        _properties = {},
        _overriddenGetters = {},
        _overriddenSetters = {};

    // Modules:
    var _modules = [];

    // Communication management:
    var _ascending = {},
        _descending = {},
        _eventListeners = {},
        _propertyListeners = {};

    // Hacks management:
    var _hackMethods = {},
        _hackDispatch = {};

    // AJAX management:
    var _services = {},
        _currentCalls = {},
        _shortcuts = {};

    // Scopes:
    function _getScope(options) {
      var o = options || {},
          scope = {
            // Methods
            get: _get,
            getEvents: _getEvents,
            getLabel: _getLabel,
            dump: _dump,
            warn: _warn,
            die: _die,
            expand: _expand,

            // Stored data:
            events: [],
            services: []
          };

      if (o.call || o.full) {
        scope.call = function(service, params) {
          this.services.push({
            service: service,
            params: params
          });
        };
      }

      if (o.full) {
        scope.addModule = _addModule;
        scope.update = _update;
      }

      return scope;
    }

    // Set protected property names:
    var _protectedNames = {
      events: 1,
      services: 1,
      hacks: 1
    };
    (function() {
      var k;
      for (k in Object.prototype)
        _protectedNames[k] = 1;
      for (k in _getScope({full: 1}))
        _protectedNames[k] = 1;
    })();


    // Initialization:
    var _o = {};
    this.name = 'domino';

    if (_type.get(arguments[0]) === 'string')
      this.name = arguments[0];
    else if (
      arguments[0] !== undefined &&
      _type.get(arguments[0]) === 'object'
    )
      _o = arguments[0];
    else if (
      arguments[1] !== undefined &&
      _type.get(arguments[1]) === 'object'
    )
      _o = arguments[1];

    this.name = _o['name'] || this.name;

    (function() {
      var i;
      for (i in _o.properties || [])
        addProperty(_o.properties[i].id, _o.properties[i]);

      for (i in _o.hacks || [])
        addHack(_o.hacks[i]);

      for (i in _o.services || [])
        addService(_o.services[i]);

      for (i in _o.shortcuts || [])
        addShortcut(_o.shortcuts[i]['id'], _o.shortcuts[i]['method']);
    })();


    /**
     * References a new property, generated the setter and getter if not
     * specified, and binds the events.
     *
     * @param   {string}  id     The id of the property.
     * @param   {?Object} options An object containing some more precise
     *                            indications about the hack.
     *
     * @private
     * @return {domino} Returns the domino instance itself.
     *
     * Here is the list of options that are interpreted:
     *
     *   {?string}          label    The label of the property (the ID by
     *                               default)
     *   {?(string|object)} type     Indicated the type of the property. Use
     *                               "?" to specify a nullable property, and
     *                               "|" for multiple valid types.
     *   {?function}        setter   Overrides the default property setter.
     *   {?function}        getter   Overrides the default property getter.
     *   {?*}               value    The initial value of the property.
     *   {?(string|array)}  triggers The list of events that can modify the
     *                               property. Can be an array or the list of
     *                               events separated by spaces.
     *   {?(string|array)}  dispatch The list of events that must be triggered
     *                               after modification of the property. Can be
     *                               an array or the list of events separated
     *                               by spaces.
     */
    function addProperty(id, options) {
      var i,
          o = options || {};

      // Check errors:
      if (id === undefined)
        _die('Property name not specified');

      if (_properties[id] !== undefined)
        _die('Property "' + id + '" already exists');

      if (_protectedNames[id] !== undefined)
        _die('"' + id + '" can not be used to name a property');

      // Label:
      _labels[id] = o['label'] || id;

      // Type:
      if (o['type'] !== undefined)
        if (!_type.isValid(o['type']))
          _warn(
            'Property "' + id + '": Type not valid'
          );
        else
          _types[id] = o['type'];

      // Setter:
      if (o['setter'] !== undefined)
        if (_type.get(o['setter']) !== 'function')
          _warn(
            'Property "' + id + '": Setter is not a function'
          );
        else {
          _setters[id] = o['setter'];
          _overriddenSetters[id] = true;
        }

      _setters[id] = _setters[id] || function(v) {
        if (
          _type.isAtom(_types[id]) &&
          _type.compare(v, _properties[id], _types[id])
        )
          return false;

        if (_types[id] && !_type.check(_types[id], v))
          _warn(
            'Property "' + id + '": Wrong type error'
          );
        else
          _properties[id] = v;

        return true;
      };

      // Getter:
      if (o['getter'] !== undefined)
        if (_type.get(o['getter']) !== 'function')
          _warn(
            'Property "' + id + '": Getter is not a function'
          );
        else {
          _getters[id] = o['getter'];
          _overriddenGetters[id] = true;
        }

      _getters[id] = _getters[id] || function() {
        return _properties[id];
      };

      // Initial value:
      if (o['value'] !== undefined || _types[id])
        o['value'] !== undefined ?
            _set(id, o['value']) :
            _dump(
              'Property "' + id + '": ' +
                'Initial value is missing'
            );

      // Triggers (modules-to-domino events):
      if (o['triggers'] !== undefined) {
        !_type.check('array|string', o['triggers']) &&
          _warn(
            'Property "' + id + '": ' +
              'Events ("triggers") must be specified in an array or ' +
              'separated by spaces in a string'
          );

        _events[id] = _utils.array(o['triggers']);
        for (i in _events[id] || []) {
          _ascending[_events[id][i]] = _ascending[_events[id][i]] || [];
          _ascending[_events[id][i]].push(id);
        }
      }

      // Dispatched events (domino-to-modules event):
      if (o['dispatch'] !== undefined)
        !_type.check('array|string', o['dispatch']) ?
          _warn(
            'Property "' + id + '": ' +
              'Events ("dispatch") must be specified in an array or ' +
              'separated by spaces in a string'
          ) :
          (_descending[id] = _utils.array(o['dispatch']));

      return _self;
    }

    /**
     * Binds a new hack. Basically, hacks make possible to explicitely
     * trigger actions and events on specified events.
     *
     * @param   {?Object} options An object containing some more precise
     *                            indications about the hack.
     *
     * @private
     * @return {domino} Returns the domino instance itself.
     *
     * Here is the list of options that are interpreted:
     *
     *   {(array|string)}  triggers The list of events that can trigger the
     *                              hack. Can be an array or the list of
     *                              events separated by spaces.
     *   {?(array|string)} dispatch The list of events that will be triggered
     *                              after actionning the hack. Can be an array
     *                              or the list of events separated by spaces.
     *                              spaces.
     *   {?function}       method   A method to execute after receiving a
     *                              trigger and before dispatching the
     *                              specified events.
     */
    function addHack(options) {
      var a, i,
          o = options || {};

      // Errors:
      if (o['triggers'] === undefined)
        _die(
          'A hack requires at least one trigger to be added'
        );

      if (o['method'] === undefined && o['dispatch'] === undefined)
        _die(
          'A hack requires at least a method or a "dispatch" value to be added'
        );

      a = _utils.array(o['triggers']);
      for (i in a) {
        // Method to execute:
        if (o['method']) {
          _hackMethods[a[i]] = _hackMethods[a[i]] || [];
          _hackMethods[a[i]].push(o['method']);
        }

        // Events to dispatch:
        if (o['dispatch'])
          _hackDispatch[a[i]] = (_hackDispatch[a[i]] || []).concat(
            _utils.array(o['dispatch'])
          );
      }

      return _self;
    }

    /**
     * References a new service, ie an helper to easily interact between your
     * server and your properties. This service will take itself as parameter
     * an object, whose most keys can override the default described bellow.
     *
     * @param   {?Object} options An object containing some more precise
     *                            indications about the service.
     *
     * @private
     * @return {domino} Returns the domino instance itself.
     *
     * Here is the list of options that are interpreted:
     *
     *   {string}          id
     *   {string|function} url
     *   {?string}         contentType+ The AJAX query content-type
     *   {?string}         dataType+    The AJAX query data-type
     *   {?string}         type+        The AJAX call type (GET|POST|DELETE)
     *   {?(*|function)}   data+*       The data sent in the AJAX call. Can be
     *                                  either an object or a function (in
     *                                  which case it will be evaluated with
     *                                  the "light" scope). Then, the object
     *                                  will be parsed, and shortcuts can be
     *                                  used in the first depth of the object.
     *   {?function}       error+       A function to execute if AJAX failed.
     *                                  Will be called in the "full" scope.
     *   {?function}       success+     A function to execute if AJAX
     *                                  successed. Will be called in the
     *                                  "full" scope.
     *   {?string}         setter+*     The name of a property. If the setter
     *                                  exists, then it will be called with the
     *                                  received data as parameter, or the
     *                                  value corresponding to the path, if
     *                                  specified.
     *   {?(string|array)} path+*       Indicates the path of the data to give
     *                                  to the setter, if specified.
     *   {?(string|array)} events++     The events to dispatch in case of
     *                                  success
     *
     * The properties followed by + are overridable when the service is called.
     * The properties followed by ++ are cumulative when the service is called.
     * The properties followed by "*" accept shortcut values.
     */
    function addService(options) {
      var o = options || {};

      // Errors:
      if (o['id'] === undefined || _type.get(o['id']) !== 'string')
        _die(
          'The service id is not indicated.'
        );

      if (!_type.check('function|string', o['url']))
        _die(
          'The service URL is not valid.'
        );

      if (_services[o['id']] !== undefined)
        _die(
          'The service "' + o['id'] + '" already exists.'
        );

      _services[o['id']] = function(params) {
        _dump('Calling service "' + o['id'] + '".');

        var p = params || {},
            ajaxObj = {
              contentType: p['contentType'] || o['contentType'],
              dataType: p['dataType'] || o['dataType'],
              type: (p['type'] || o['type'] || 'GET').toString().toUpperCase(),
              data: _type.get(o['data']) === 'function' ?
                      o['data'].call(_getScope(), p['data']) :
                      (p['data'] || o['data']),
              url: _type.get(o['url']) === 'function' ?
                      o['url'].call(_getScope(), p['data']) :
                      o['url'],
              error: function(mes, xhr) {
                _self.dispatchEvent('domino.ajaxFailed');
                var error = p['error'] || o['error'],
                    services = [],
                    update = {},
                    dispatch = {},
                    a, k, property;

                if (_type.get(error) === 'function') {
                  var obj = _execute(error, {
                    parameters: [mes, xhr, p],
                    scope: {
                      call: true
                    }
                  });

                  a = _utils.array(obj.events);
                  for (k in a)
                    dispatch[a[k]] = 1;

                  for (k in obj.properties)
                    if (update[k] === undefined)
                      update[k] = obj.properties[k];
                    else
                      _warn(
                        'The property ' +
                        '"' + k + '"' +
                        ' is not a method nor a property.'
                      );

                  services = services.concat(obj.services || []);
                } else
                  _dump(
                    'Loading failed with message "' + mes + '" and status.'
                  );

                // Check if hacks have left some properties to update:
                for (property in update) {
                  if (_setters[property] === undefined)
                      _warn('The property is not referenced.');
                    else if (_set(property, update[property])) {
                      for (i in _propertyListeners[property])
                        _execute(_propertyListeners[property][i], {
                          parameters: [_self.getEvent(
                            property,
                            _getScope()
                          )]
                        });

                      for (i in _descending[property] || [])
                        dispatch[_descending[property][i]] = 1;
                    }
                }

                // Check services to call:
                for (k in services || [])
                  _call(services[k].service, services[k].params);

                // Check events to dispatch:
                a = [];
                for (event in dispatch) {
                  _self.dispatchEvent(event, _getScope());
                  a.push(_self.getEvent(event, _getScope()));
                }

                // Reloop:
                if (a.length)
                  _mainLoop(a);
              }
            };

        var i, exp, k, doTest,
            pref = __settings__['shortcutPrefix'],
            regexContains = new RegExp(pref + '(\\w+)', 'g'),
            regexFull = new RegExp('^' + pref + '(\\w+)$'),
            oldURL = null,
            matches;

        // Check that URL is still a string:
        if (_type.get(ajaxObj['url']) !== 'string')
          _die(
            'The URL is no more a string (typed "' +
            _type.get(ajaxObj['url']) +
            '")'
          );

        // Manage shortcuts in URL:
        while (
          (matches = ajaxObj['url'].match(regexContains)) &&
          ajaxObj['url'] !== oldURL
        ) {
          oldURL = ajaxObj['url'];
          for (i in matches) {
            exp = _expand(matches[i], p['params']);
            ajaxObj['url'] =
              ajaxObj['url'].replace(new RegExp(matches[i], 'g'), exp);
          }
        }

        // Manage shortcuts in params:
        // (NOT DEEP - only first level)
        doTest = true;
        if (_type.get(ajaxObj['data']) === 'string')
          if (ajaxObj['data'].match(regexFull))
            ajaxObj['data'] = _expand(ajaxObj['data'], p['params']);

        if (_type.get(ajaxObj['data']) === 'object')
          while (doTest) {
            doTest = false;
            for (k in ajaxObj['data'])
              if (
                _type.get(ajaxObj['data'][k]) === 'string' &&
                ajaxObj['data'][k].match(regexFull)
              ) {
                ajaxObj['data'][k] = _expand(ajaxObj['data'][k], p['params']);
                doTest = true;
              }
          }

        // Success management:
        ajaxObj.success = function(data) {
          _dump('Service "' + o['id'] + '" successfull.');

          var i, a, pushEvents, event, property,
              pathArray, d,
              services = [],
              dispatch = {},
              update = {},
              path = p['path'] || o['path'],
              setter = p['setter'] || o['setter'],
              success = p['success'] || o['success'];

          // Expand different string params:
          if (_type.get(setter) === 'string')
            setter = _expand(setter, p['params']);
          if (_type.get(path) === 'string')
            path = _expand(path, p['params']);

          // Check path:
          d = data;

          if ((path || '').match(/^(?:\w+\.)*\w+$/))
            pathArray = _type.get(path, 'string') ?
              path.split('.') :
              undefined;
          else if (_type.get(path) === 'string')
            _warn(
              'Path "' + path + '" does not match RegExp /^(?:\\w+\\.)*\\w+$/'
            );

          if (pathArray)
            for (i in pathArray) {
              d = d[pathArray[i]];
              if (d === undefined) {
                _warn(
                  'Wrong path "' + path + '" for service "' + o['id'] + '".'
                );
                continue;
              }
            }

          // Events to dispatch (service config):
          a = _utils.array(o['events']);
          for (i in a)
            dispatch[a[i]] = 1;

          // Events to dispatch (call config):
          a = _utils.array(p['events']);
          for (i in a)
            dispatch[a[i]] = 1;

          // Check setter:
          if (setter && _setters[setter])
            if (_set(setter, d)) {
              for (k in _descending[setter] || [])
                dispatch[_descending[setter][k]] = 1;

              for (k in _propertyListeners[setter])
                _execute(_propertyListeners[setter][k], {
                  parameters: [_self.getEvent(
                    setter,
                    _getScope()
                  )]
                });
            }

          // Check success:
          if (_type.get(success) === 'function') {
            var obj = _execute(success, {
              parameters: [data, p],
              scope: {
                call: true
              }
            });

            a = _utils.array(obj.events);
            for (k in a)
              dispatch[a[k]] = 1;

            for (k in obj.properties)
              if (update[k] === undefined)
                update[k] = obj.properties[k];
              else
                _warn(
                  'The property "' + k + '" is not a method nor a property.'
                );

            services = services.concat(obj.services || []);
          }

          // Check if hacks have left some properties to update:
          for (property in update) {
            if (_setters[property] === undefined)
                _warn('The property is not referenced.');
              else if (_set(property, update[property])) {
                for (i in _propertyListeners[property])
                  _execute(_propertyListeners[property][i], {
                    parameters: [_self.getEvent(
                      property,
                      _getScope()
                    )]
                  });

                for (i in _descending[property] || [])
                  dispatch[_descending[property][i]] = 1;
              }
          }

          // Check services to call:
          for (k in services || [])
            _call(services[k].service, services[k].params);

          // Check events to dispatch:
          a = [];
          for (event in dispatch) {
            _self.dispatchEvent(event, _getScope());
            a.push(_self.getEvent(event, _getScope()));
          }

          // Reloop:
          if (a.length)
            _mainLoop(a);
        };

        // Abort:
        if (p['abort'] && _currentCalls[o['id']])
          _currentCalls[o['id']].abort();

        // Launch AJAX call:
        _currentCalls[o['id']] = _utils.ajax(ajaxObj);
      };

      return _self;
    }

    /**
     * Creates a shortcut, that can be called from different parameters in the
     * services. Basically, makes easier to insert changing values in URLs,
     * data, etc...
     *
     * Any property is already registered as shortcut (that returns then the
     * value when called), but can be overridden safely.
     *
     * @param   {string}   id     The string to use to call the shortcut.
     * @param   {function} method The method to call.
     *
     * @private
     * @return {domino} Returns the domino instance itself.
     */
    function addShortcut(id, method) {
      // Check errors:
      if (id === undefined)
        _die('Shortcut ID not specified.');

      if (_shortcuts[id])
        _die('Shortcut "' + id + '" already exists.');

      if (method === undefined)
        _die('Shortcut method not specified.');

      // Add shortcut:
      _shortcuts[id] = method;

      return _self;
    }

    /**
     * This module will create and reference a module, and return it
     *
     * @param   {function} klass   The module class constructor.
     * @param   {?array}   params  The array of the parameters to give to the
     *                             module constructor. The "light" scope will
     *                             always be given as the last parameter, to
     *                             make it easier to find labels or events
     *                             related to any property.
     * @param   {?object}  options An object containing some more precise
     *                             indications about the service (currently not
     *                             used).
     *
     * @private
     * @return {*} Returns the module just created.
     */
    function _addModule(klass, params, options) {
      var i,
          o = options || {},
          module = {},
          bind = {},
          triggers,
          property,
          events,
          event;

      // Check errors:
      if (klass === undefined)
        _die('Module class not specified.');

      if (_type.get(klass) !== 'function')
        _die('First parameter must be a function.');

      // Instanciate the module:
      klass.apply(module, (params || []).concat(_getScope()));
      triggers = module.triggers || {};

      // Ascending communication:
      for (event in triggers.events || {}) {
        _eventListeners[event] = _eventListeners[event] || [];
        _eventListeners[event].push(triggers.events[event]);
      }

      for (property in triggers.properties || {}) {
        for (i in _descending[property] || []) {
          _propertyListeners[property] =
            _propertyListeners[property] || [];

          _propertyListeners[property].push(
            triggers.properties[property]
          );
        }

        if (_getters[property] !== undefined) {
          var data = {};
          data[property] = _get(property);
          _execute(triggers.properties[property], {
            parameters: [_self.getEvent('domino.initialUpdate', _getScope())]
          });
        }
      }

      // Descending communication:
      for (event in _ascending || {})
        bind[event] = 1;

      for (event in _hackMethods || {})
        bind[event] = 1;

      for (event in _hackDispatch || {})
        bind[event] = 1;

      for (event in bind)
        module.addEventListener(event, _mainLoop);

      // Finalize:
      _modules.push(module);
      return module;
    }

    /**
     * The main loop, that is triggered either by modules, hacks or event by
     * itself, and that will update properties and dispatch events to the
     * modules, trigger hacks (and so eventually load services, for example).
     *
     * @param   {array|object}   events  The event or an array of events.
     * @param   {?object}        options The optional parameters.
     * @private
     */
    function _mainLoop(events, options) {
      var a, i, j, k, event, data, pushEvents, property,
          services = [],
          log = [],
          o = options || {},
          dispatch = {},
          update = {};

      o['loop'] = (o['loop'] || 0) + 1;

      var eventsArray = _utils.array(events);

      // Log:
      for (i in eventsArray)
        log.push(eventsArray[i].type);
      _dump('Iteration ' + o['loop'] + ' (main loop) :', log);

      // Effective loop:
      for (i in eventsArray) {
        event = eventsArray[i];
        data = event.data || {};

        // Check properties to update:
        if (data || o['force']) {
          a = _ascending[event.type] || [];
          for (j in a) {
            pushEvents = !!o['force'];

            if (data[a[j]] !== undefined)
              pushEvents = _set(a[j], data[a[j]]) || pushEvents;

            if (pushEvents) {
              for (k in _propertyListeners[a[j]])
                _execute(_propertyListeners[a[j]][k], {
                  parameters: [_self.getEvent(a[j], _getScope())]
                });

              for (k in _descending[a[j]] || [])
                dispatch[_descending[a[j]][k]] = 1;
            }
          }
        }

        // Check hacks to trigger:
        for (k in _eventListeners[event.type]) {
          _execute(_eventListeners[event.type][k], {
            parameters: [event]
          });
        }

        for (j in _hackMethods[event.type] || []) {
          var obj = _execute(_hackMethods[event.type][j], {
            parameters: [event],
            scope: {
              call: true
            }
          });

          a = _utils.array(obj.events);
          for (k in a)
            dispatch[a[k]] = 1;

          for (k in obj.properties)
            if (update[k] === undefined)
              update[k] = obj.properties[k];
            else
              _warn(
                'The property "' + k + '" is not a method nor a property.'
              );

          services = services.concat(obj.services || []);
        }

        for (j in _hackDispatch[event.type] || [])
          dispatch[_hackDispatch[event.type][j]] = 1;
      }

      // Check if hacks have left some properties to update:
      for (property in update) {
        if (_setters[property] === undefined)
            _warn('The property is not referenced.');
          else if (_set(property, update[property])) {
            for (i in _propertyListeners[property])
              _execute(_propertyListeners[property][i], {
                parameters: [_self.getEvent(
                  property,
                  _getScope()
                )]
              });

            for (i in _descending[property] || [])
              dispatch[_descending[property][i]] = 1;
          }
      }

      // Check services to call:
      for (k in services || [])
        _call(services[k].service, services[k].params);

      a = [];
      for (event in dispatch) {
        _self.dispatchEvent(event, _getScope());
        a.push(_self.getEvent(event, _getScope()));
      }

      // Reloop:
      if (a.length)
        _mainLoop(a, o);
    }

    /**
     * A method that can update any of the properties - designed to be used
     * especially from the hacks, eventually from the services success methods.
     * For each property actually updated, the related events will be
     * dispatched through the _mainLoop method.
     *
     * @param   {object|array}   properties The properties to update.
     * @param   {?object}        options    The optional parameters.
     * @private
     */
    function _update(properties, options) {
      var i, k, a, event,
          log = [],
          p = properties,
          dispatch = {},
          o = options || {};

      if (p == null)
        _warn('Nothing to update.');

      if (_type.get(p) === 'array')
        for (k in p) {
          log.push(p[k]['property']);

          if (_setters[p[k]['property']] === undefined)
            _warn('The property is not referenced.');
          else if (_set.apply(
            [
              p[k]['property'],
              p[k]['value']
            ].concat(p[k]['parameters'] || [])
          )) {
            for (i in _propertyListeners[p[k]['property']])
              _execute(_propertyListeners[p[k]['property']][i], {
                parameters: [_self.getEvent(
                  p[k]['property'],
                  _getScope()
                )]
              });

            for (i in _descending[p[k]['property']] || [])
              dispatch[_descending[p[k]['property']][i]] = 1;
          }
        }
      else if (_type.get(p) === 'object')
        for (k in p) {
          log.push(k);

          if (_setters[k] && _set(k, p[k])) {
            for (i in _propertyListeners[k])
              _execute(_propertyListeners[k][i], {
                parameters: [_self.getEvent(k, _getScope())]
              });

            for (i in _descending[k] || [])
              dispatch[_descending[k][i]] = 1;
          }
        }
      else
        _warn('The properties must be stored in an array or an object.');

      _dump('Updating properties :', log);

      a = [];
      for (event in dispatch) {
        _self.dispatchEvent(event, _getScope());
        a.push(_self.getEvent(event, _getScope()));
      }

      // Reloop:
      if (a.length)
        _mainLoop(a, p);

      return this;
    }

    function _get(property) {
      if (_getters[property]) {
        if (_overriddenGetters[property]) {
          var arg = [],
              inputs = {},
              res;

          for (var i = 1, l = arguments.length; i < l; i++)
            arg.push(arguments[i]);

          inputs[property] = _properties[property];

          res = _execute(_getters[property], {
            parameters: arg,
            inputValues: inputs
          });

          return res['returned'];
        } else
          return _getters[property]();
      } else
        _warn('Property "' + property + '" not referenced.');
    }

    function _set(property, value) {
      if (_setters[property]) {
        if (_overriddenSetters[property]) {
          var updated, res,
              arg = [],
              inputs = {};

          inputs[property] = value;

          for (var i = 1, l = arguments.length; i < l; i++)
            arg.push(arguments[i]);

          res = _execute(_setters[property], {
            parameters: arg,
            inputValues: inputs
          });
          updated = _type.get(res['returned']) !== 'boolean' || res['returned'];

          if (updated)
            _properties[property] = res['properties'][property];

          return updated;
        } else
          return _setters[property].call(_getScope(), value);
      }

      _warn('Property "' + property + '" not referenced.');
      return false;
    }

    function _call(service, params) {
      if (_services[service])
        _services[service](params);
      else
        _warn('Service "' + service + '" not referenced.');

      return this;
    }

    function _execute(closure, options) {
      var k, res, returned,
          o = options || {},
          scope = _getScope(o.scope);

      if (_type.get(closure) !== 'function')
        _die('The first parameter must be a function');

      for (k in o['inputValues'] || {})
        scope[k] = o['inputValues'][k];

      // Execute the function on the related scope:
      returned = closure.apply(scope, o['parameters'] || []);

      // Initialize result object:
      res = {
        'returned': returned,
        'properties': {},
        'events': {},
        'services': []
      };

      // Check new vars:
      if (scope['events'] != null && !_type.check('array', scope['events']))
        _warn('Events must be stored in an array.');
      else
        res['events'] = scope['events'];

      for (k in scope)
        if (_setters[k] !== undefined) {
          res['properties'][k] = scope[k];
        } else if (_protectedNames[k] === undefined)
          _warn('The key "' + k + '" is not a method nor a property.');

      for (k in o['inputValues'])
        res['properties'][k] = scope[k];

      for (k in scope['services'])
        res['services'][k] = scope['services'][k];

      return res;
    }

    function _getLabel(id) {
      return _labels[id];
    }

    function _getEvents(id) {
      return _events[id];
    }

    function _warn(s) {
      var a = ['[' + _self.name + ']'];

      if (!__settings__['strict'])
        a.push('WARNING');

      for (var k in arguments)
        a.push(arguments[k]);

      __warn__.apply(_self, a);
    };

    function _die(s) {
      var a = ['[' + _self.name + ']'];

      for (var k in arguments)
        a.push(arguments[k]);

      __die__.apply(_self, a);
    };

    function _dump() {
      var a = ['[' + _self.name + ']'];

      for (var k in arguments)
        a.push(arguments[k]);

      __dump__.apply(_self, a);
    };

    function _expand(v) {
      var l = arguments.length,
          a = (v || '').toString().match(
            new RegExp('^' + __settings__['shortcutPrefix'] + '(\\w+)$')
          );

      // Case where the string doesn't match:
      if (!a || !a.length)
        return v;
      a = a[1];

      // Check shortcuts:
      if (_type.get(_shortcuts[a]) === 'function')
        return _shortcuts[a].call(_getScope());

      // Check properties:
      if (_type.get(_getters[a]) === 'function')
        return _get(a);

      // Check other custom objects:
      for (var i = 1; i < l; i++)
        if ((arguments[i] || {})[a] !== undefined)
          return arguments[i][a];

      return v;
    }

    // Return the full scope:
    return _getScope({ full: true });
  };
  var domino = window.domino;


  /**
   * Utils classes:
   */

  // Logs:
  function __warn__() {
    if (__settings__['strict'])
      __die__.apply(this, arguments);
    else
      __dump__.apply(this, arguments);
  }

  function __die__() {
    var m = '';
    for (var k in arguments)
      m += arguments[k];

    throw (new Error(m));
  }

  function __dump__() {
    if (!__settings__['verbose'])
      return;

    var a = [];
    for (var k in arguments)
      a.push(arguments[k]);

    if (__settings__['displayTime'])
      a.unshift(('00000000' + (new Date().getTime() - _startTime)).substr(-8));

    console.log.apply(console, a);
  }

  // Utils:
  domino.utils = {
    array: function(v, sep) {
      var a = (
            domino.utils.type.get(v) === 'string' ?
              v.split(sep || ' ') :
              domino.utils.type.get(v) === 'array' ?
                v :
                [v]
          ),
          res = [];
      for (var i in a)
        if (!!a[i])
          res.push(a[i]);

      return res;
    },
    ajax: function(o, fn) {
      if (typeof o === 'string')
        o = { url: o, ok: fn };
      else if (this.type.get(o) !== 'object')
        __die__('[domino.global] Invalid parameter given to AJAX');

      var type = o.type || 'GET',
          url = o.url || '',
          ctyp = o.contentType || 'application/x-www-form-urlencoded',
          dtyp = o.dataType || 'json',
          xhr = new XMLHttpRequest(),
          timer,
          d, n;

      if (o.data) {
        if (typeof o.data === 'string')
          d = o.data;
        else if (/json/.test(ctyp))
          d = JSON.stringify(o.data);
        else {
          d = [];
          for (n in o.data)
            d.push(encodeURIComponent(n) + '=' + encodeURIComponent(o.data[n]));
          d = d.join('&');
        }

        if (/GET|DEL/i.test(type)) {
          url += /\?/.test(url) ?
            '&' + d :
            '?' + d;
          d = '';
        }
      }

      xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
          if (timer)
            clearTimeout(timer);

          if (/^2/.test(xhr.status)) {
            d = xhr.responseText;
            if (/json/.test(dtyp)) {
              try {
                d = JSON.parse(xhr.responseText);
              } catch (e) {
                return (
                  o.error &&
                  o.error('JSON parse error: ' + e.message, xhr)
                );
              }
            }
            o.success && o.success(d, xhr);
          } else {

            var message = +xhr.status ?
              xhr.responseText :
              xhr.responseText.length ?
                'Aborted: ' + xhr.responseText :
                'Aborted';

            o.error && o.error(message, xhr);
          }
        }
      };

      xhr.open(type, url, true);
      xhr.setRequestHeader('Content-Type', ctyp);

      if (o.headers)
        for (n in o.headers)
          xhr.setRequestHeader(n, o.headers[n]);

      if (o.timeout)
        timer = setTimeout(function() {
          xhr.onreadystatechange = function() {};
          xhr.abort();
          if (o.error)
            o.error && o.error('timeout', xhr);
        }, o.timeout * 1000);

      xhr.send(d);
      return xhr;
    },
    type: (function() {
      var atoms = ['number', 'string', 'boolean', 'null', 'undefined'],
          classes = (
            'Boolean Number String Function Array Date RegExp Object'
          ).split(' '),
          class2type = {},
          types = ['*'];


      // Fill types
      for (var k in classes) {
        var name = classes[k];
        types.push(name.toLowerCase());
        class2type['[object ' + name + ']'] = name.toLowerCase();
      }

      return {
        get: function(obj) {
          return obj == null ?
            String(obj) :
            class2type[Object.prototype.toString.call(obj)] || 'object';
        },
        check: function(type, obj) {
          var a, i,
              typeOf = this.get(obj);

          if (this.get(type) === 'string') {
            a = type.replace(/^\?/, '').split(/\|/);
            for (i in a)
              if (types.indexOf(a[i]) < 0)
                __warn__('[domino.global] Invalid type');

            if (obj == null)
              return !!type.match(/^\?/, '');
            else
              type = type.replace(/^\?/, '');

            var splitted = type.split(/\|/);

            return !!(~splitted.indexOf('*') || ~splitted.indexOf(typeOf));
          } else if (this.get(type) === 'object') {
            if (typeOf !== 'object')
              return false;
            var k;

            for (k in type)
              if (!this.check(type[k], obj[k]))
                return false;

            for (k in obj)
              if (type[k] === undefined)
                return false;

            return true;
          } else
            return false;
        },
        isAtom: function(type) {
          var a, i;
          if (this.get(type) === 'string') {
            a = type.replace(/^\?/, '').split(/\|/);
            for (i in a)
              if (atoms.indexOf(a[i]) < 0)
                return false;
            return true;
          } else if (this.get(type) === 'object') {
            for (i in type)
              if (!this.isAtom(type[i]))
                return false;
            return true;
          }

          return false;
        },
        compare: function(v1, v2, type) {
          var t1 = this.get(v1),
              t2 = this.get(v2),
              a, i;

          if (
            !this.isAtom(type) ||
            !this.check(type, v1) ||
            !this.check(type, v2)
          )
            return false;

          if (this.get(type) === 'string') {
            return v1 === v2;
          } else if (this.get(type) === 'object') {
            for (i in type)
              if (!this.compare(v1[i], v2[i], type[i]))
                return false;
            return true;
          }

          return false;
        },
        isValid: function(type) {
          var a, k, i;
          if (this.get(type) === 'string') {
            a = type.replace(/^\?/, '').split(/\|/);
            for (i in a)
              if (types.indexOf(a[i]) < 0)
                return false;
            return true;
          } else if (this.get(type) === 'object') {
            for (k in type)
              if (!this.isValid(type[k]))
                return false;

            return true;
          } else
            return false;
        }
      };
    })()
  };
  var utils = domino.utils;

  // Global settings:
  var __settings__ = {
    strict: false,
    verbose: false,
    shortcutPrefix: ':',
    displayTime: false
  };

  domino.settings = function(a1, a2) {
    if (typeof a1 === 'string' && a2 === undefined)
      return __settings__[a1];
    else {
      var o = (typeof a1 === 'object' && a2 === undefined) ? a1 || {} : {};
      if (typeof a1 === 'string')
        o[a1] = a2;

      for (var k in o)
        if (__settings__[k] !== undefined)
          __settings__[k] = o[k];

      return this;
    }
  };

  // Event dispatcher:
  domino.EventDispatcher = function() {
    var _handlers = {};

    /**
     * Will execute the handler everytime that the indicated event (or the
     * indicated events) will be triggered.
     * @param  {string}           events  The name of the event (or the events
     *                                    separated by spaces).
     * @param  {function(Object)} handler The handler to addEventListener.
     * @return {EventDispatcher} Returns itself.
     */
    function addEventListener(events, handler) {
      if (!arguments.length)
        return this;
      else if (
        arguments.length === 1 &&
        utils.type.get(arguments[0]) === 'object'
      )
        for (var events in arguments[0])
          this.addEventListener(events, arguments[0][events]);
      else if (arguments.length > 1) {
        var event,
            events = arguments[0],
            handler = arguments[1],
            eArray = utils.array(events),
            self = this;

        for (var i in eArray) {
          event = eArray[i];

          if (!_handlers[event])
            _handlers[event] = [];

          // Using an object instead of directly the handler will make possible
          // later to add flags
          _handlers[event].push({
            handler: handler
          });
        }
      }

      return this;
    };

    /**
     * Removes the handler from a specified event (or specified events).
     * @param  {?string}           events  The name of the event (or the events
     *                                     separated by spaces). If undefined,
     *                                     then all handlers are removed.
     * @param  {?function(Object)} handler The handler to removeEventListener.
     *                                     If undefined, each handler bound to
     *                                     the event or the events will be
     *                                     removed.
     * @return {EventDispatcher} Returns itself.
     */
    function removeEventListener(events, handler) {
      if (!arguments.length) {
        this._handlers_ = {};
        return this;
      }

      var i, j, a, event,
          eArray = utils.array(events),
          self = this;

      if (handler) {
        for (i in eArray) {
          event = eArray[i];
          if (_handlers[event]) {
            a = [];
            for (j in _handlers[event])
              if (_handlers[event][j].handler !== handler)
                a.push(_handlers[event][j]);

            _handlers[event] = a;
          }

          if (_handlers[event] && _handlers[event].length === 0)
            delete _handlers[event];
        }
      } else
        for (i in eArray)
          delete _handlers[eArray[i]];

      return self;
    };

    /**
     * Executes each handler bound to the event
     * @param  {string}  events The name of the event (or the events separated
     *                          by spaces).
     * @param  {?Object} data   The content of the event (optional).
     * @return {EventDispatcher} Returns itself.
     */
    function dispatchEvent(events, data) {
      var i, j, a, event, eventName,
          eArray = utils.array(events),
          self = this;

      data = data === undefined ? {} : data;

      for (i in eArray) {
        eventName = eArray[i];

        if (_handlers[eventName]) {
          event = self.getEvent(eventName, data);
          a = [];

          for (j in _handlers[eventName]) {
            _handlers[eventName][j].handler(event);
            if (!_handlers[eventName][j]['one'])
              a.push(_handlers[eventName][j]);
          }

          _handlers[eventName] = a;
        }
      }

      return this;
    };

    /**
     * Return an event Object.
     * @param  {string}  events The name of the event.
     * @param  {?Object} data   The content of the event (optional).
     * @return {Object} Returns itself.
     */
    function getEvent(event, data) {
      return {
        type: event,
        data: data,
        target: this
      };
    };

    this.removeEventListener = removeEventListener;
    this.addEventListener = addEventListener;
    this.dispatchEvent = dispatchEvent;
    this.getEvent = getEvent;
  };
  var dispatcher = domino.EventDispatcher;

  // Default module template:
  domino.module = function() {
    dispatcher.call(this);

    // In this object will be stored the module's triggers:
    this.triggers = {
      properties: {},
      events: {}
    };
  };
  var module = domino.module;
})(window);
