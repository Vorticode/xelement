/*
Inherit from XElement to create custom HTML Components.

TODO:
speed up data-loop by only modifying changed elements.
Fix failing Edge tests.
implement other binding functions.
create from <template> tag
compress

shadow DOM - https://developers.google.com/web/fundamentals/web-components/shadowdom
Move functions to outer scope so people can implement thier own attributes?
non-ascii variable names.
throttle, debounce?
Auto two-way bind for simple variables?
bind to <input type="file">
bind to drag/drop events, allow sortable?
bind to clipboard events
Named slot support? - https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_templates_and_slots
Separate out a lite version that doesn't do binding?
This would also make the code easier to follow.  But what to call it?  XEl ? XElementLite?
*/

(()=>{

	// --------------------------------------------------------------------------------------
	// Minification replacements.
	// --------------------------------------------------------------------------------------
	//%replace%


	// --------------------------------------------------------------------------------------
	// Variable Parsing functions
	// --------------------------------------------------------------------------------------

	// Regex for matching javascript variables.  Made from pieces of this regex:  https://www.regexpal.com/?fam=112426
	var varStart = '([$a-z_][$a-z0-9_]*)';       // A regular variable name.
	var varDotStart = '\\.\\s*' + varStart;
	var varBrD = '\\[\\s*"(([^"]|\\")*)"\\s*]';  // A ["as\"df"] index
	var varBrS = varBrD.replace(/"/g, "'");      // A ['as\'df'] index
	var varNum = "\\[\\s*(\\d+)\\s*]";           // A [3] index (numerical)

	var or = '\\s*|\\s*';
	var varProp = varDotStart + or + varBrD + or + varBrS + or + varNum;

	var or2 = '\\s*\\(?|^\\s*';
	var varPropOrFunc = '^\\s*' + varDotStart + or2 + varBrD + or2 + varBrS + or2 + varNum + '\\s*\\(?';

	var isSimpleVarRegex = new RegExp('^' + varStart + '(' + varProp + ')*$', 'i');
	var isSimpleCallRegex = new RegExp('^' + varStart + '(' + varProp + ')*\\(', 'i');
	var varStartRegex = new RegExp(varStart, 'gi');
	var varPropRegex  = new RegExp(varPropOrFunc, 'gi');

	// https://mathiasbynens.be/notes/javascript-identifiers
	var nonVars = 'length,caller,callee,prototype,arguments,true,false,null,undefined,NaN,Infinity,break,case,catch,continue,debugger,default,delete,do,else,finally,for,function,if,in,instanceof,new,return,switch,throw,try,typeof,var,void,while,with,class,const,enum,export,extends,import,super,implements,interface,let,package,private,protected,public,static,yield'.split(/,/g);

	function isSimpleVar_(code) {
		return code.trim().match(isSimpleVarRegex) !== null;
	}
	function isSimpleCall_(code) {
		// if it starts with a variable followed by ( and has no more than one semicolon.
		code = code.trim();
		var semiCount = (code.match(/;/g) ||[]).length;
		if (semiCount > 1 || semiCount===1 && code.slice(-1) !== ';')
			return false; // code has more than one semicolon, or one semicolon that's not at the end.
		return code.match(isSimpleCallRegex) !== null;
	}

	/**
	 * Take a string of code and parse out all JavaScript variable names,
	 * ignoring function calls "name(" and anything in nonVars that's not inside [''].
	 * @param code {string}
	 * @param includeThis {boolean=false} Include "this." when parsing variables.
	 * @param allowCall {boolean=false}
	 * @returns {string[][]} An array of paths, where a path is all sub-properties of a variable name.
	 * @example
	 *     parseVars('this.person.firstName.substr()', true) // returns [['this', 'person', 'firstName']]
	 *     parseVars('var a = b["c"]') // returns [['a'], ['b', 'c']] */
	function parseVars(code, includeThis, allowCall) {
		//code = code.trim(); // Breaks indices.
		var result = [];
		var index = 0;

		while (code.length) {
			let current = [], matches;
			current.index_ = []; // track the index of each match within code.
			var regex = varStartRegex; // Reset for looking for start of a variable.
			while (code.length && (matches = regex.exec(code)) !== null) {

				//regex.lastIndex = matches.index; // reset the regex.
				index += matches.index;

				code = code.substr(regex.lastIndex); // advance forward in parsing code.
				regex.lastIndex = 0; // reset the regex.

				// fitler() removes undefineds from matches.
				// This lets us get the first non-undefiend parenthetical submatch.
				let item = matches.filter(Boolean)[1];

				// Don't grab functions or common functions properties as vars unless they are within brackets.
				// matches[1] is the match for a .variable and not something in brackets.
				if ((!allowCall && matches[0].endsWith('(')) || nonVars.includes(matches[1])) {
					index += matches[0].length;
					break;
				}

				// Add varible property to current path
				if (includeThis || item !== 'this') {
					current.push(item);
					current.index_.push(index);
				}

				index += matches[0].length;
				regex = varPropRegex; // switch to reading subsequent parts of the variable.
			}

			// Start parsing a new variable.
			index += regex.lastIndex;
			regex.lastIndex = 0; // reset the regex.
			if (current.length)
				result.push(current);
			else
				break;
		}

		return result;
	}

	/**
	 * @param code {string}
	 * @param replacements {object<string, string>}
	 * @returns {string} */
	function replaceVars(code, replacements) {
		var paths = parseVars(code, true);
		for (let path of paths.reverse()) // We loop in reverse so the replacement indices don't get messed up.
			for (let oldVar in replacements) {
				let newVar = replacements[oldVar];
				if (path.length >= 1 && path[0] === oldVar)
					code = code.substr(0, path.index_[0]) + newVar + code.substr(path.index_[0] + oldVar.length);
			}

		return code;
	}

	/**
	 * Parse "items : item" into two part, always splitting on the last colon.
	 * @param code {string}
	 * @return {[string, string]} */
	function parseLoop(code) {
		// Parse code into foreach parts.
		var colon = code.lastIndexOf(':');
		if (colon === -1)
			throw new Error('data-loop attribute value "' + code + '" must include colon.');
		var loopVar = code.substr(colon+1);
		code = code.substr(0, colon);

		if (isSimpleVar_(code) && !code.startsWith('this'))
			code = 'this.' + code;

		return [code, loopVar];
	}





	// --------------------------------------------------------------------------------------
	// Watch functions
	// --------------------------------------------------------------------------------------

	/**
	 * Call callback() with a 'set' or 'delete' action whenever anything within object is added, removed, or modified.
	 * Monitors all deeply nested properties including array operations.
	 * Got ideas from here:  https://stackoverflow.com/questions/41299642/how-to-use-javascript-proxy-for-nested-objects
	 * @param root {object}
	 * @param callback {function(action:string, path:string[], value:string?)}
	 * @returns {Proxy} */
	function watchObj(root, callback) {

		// A map between objects and their string[] path.
		// This is passed to callback whenever a prop changes so we know what changed.
		var paths = new WeakMap();
		paths.set(root, []);

		var handler = {
			/**
			 * Overridden to wrap returned values in a Proxy, so we can see when they're changed.
			 * And to keep track of the path as we traverse deeper into an object.
			 * @param obj {object}
			 * @param field {string} An object key or array index.
			 * @returns {*} */
			get(obj, field) {
				var result = obj[field];
				if (typeof result === 'object' && result !== null) {

					// Keep track of paths.
					// Paths are built recursively as we descend, by getting the parent path and adding the new field.
					if (!paths.has(result))
						paths.set(result, [...paths.get(obj), field]);

					// If setting the value to an object or array, also create a proxy around that one.
					return new Proxy(result, handler);
				}
				return result;
			},

			/**
			 * Trap called whenever anything in an array or object is set.
			 * Changing and shifting array values will also call this function.
			 * @param obj {object} root or an object within root that we're setting a property on.
			 * @param field {string} An object key or array index.
			 * @param newVal {*}
			 * @returns {boolean} */
			set(obj, field, newVal) {
				if (field !== 'length')
					callback('set', [...paths.get(obj), field], obj[field] = newVal);
				return true;
			},

			/**
			 * Trap called whenever anything in an array or object is deleted.
			 * @param obj {object} root or an object within root that we're deleting a property on.
			 * @param field {int|string} An object key or array index.
			 * @returns {boolean} */
			deleteProperty(obj, field) {
				if (Array.isArray(obj))
					obj.splice(field, 1);
				else
					delete obj[field];
				callback('delete', [...paths.get(obj), field]);
				return true;
			}
		};

		return new Proxy(root, handler);
	}

	/**
	 * @param obj {object}
	 * @param path {string[]}
	 * @param create {boolean=false} */
	function traversePath(obj, path, create) {
		for (let i=0; i<path.length; i++) { // length-1 because we don't want to set the deepest prop to be an object, just undefiend.
			let srcProp = path[i];

			// If the path is undefined and we're not to the end yet:
			if (obj[srcProp] === undefined && i < path.length-1) {

				// If the next index is an integer or integer string.
				if (create) {
					if ((path[i + 1] + '').match(/^\d+$/))
						obj[srcProp] = [];
					else
						obj[srcProp] = {};
				}
				else
					return undefined; // can't traverse
			}

			// Traverse deeper along destination object.
			obj = obj[srcProp];
		}

		return obj;
	}

	class WatchProperties {

		constructor(obj) {
			this.obj_ = obj;   // Original object being watched.
			this.fields_ = {}; // Unproxied underlying fields that store the data.
			this.proxy_ = watchObj(this.fields_, this.notify.bind(this));
			this.subs_ = [];
		}

		/**
		 * When a property or sub-property changes, notify its subscribers.
		 * @param action {string}
		 * @param path {string[]}
		 * @param value {*=} */
		notify(action, path, value) {

			// Traverse up the path looking for anything subscribed.
			path = path.slice();
			while (path.length) {
				var jpath = JSON.stringify(path); // TODO: This seems like a lot of work for any time a property is changed.

				if (jpath in this.subs_)
					for (let callback of this.subs_[jpath])
						callback.apply(this.obj_, arguments) // "this.obj_" so it has the context of the original object.
				path.pop();
			}
		}

		/**
		 *
		 * @param path {string|string[]}
		 * @param callback {function((action:string, path:string[], value:string?)} */
		subscribe(path, callback) {
			if (typeof path === 'string')
				path = parseVars(path)[0];

			// Create property at top level path, even if we're only watching something much deeper.
			// This way we don't have to worry about overriding properties created at deper levels.
			var self = this;
			var field = path[0];
			if (!(field in self.fields_)) {

				// Set initial value from obj, creating the path to it.
				traversePath(this.fields_, path, true);

				// If we're subscribing to something within the top-level field for the first time,
				// then define it as a property that forward's to the proxy.
				Object.defineProperty(self.obj_, field, {
					enumerable: true,
					configurable: true,
					get: () => {
						return self.proxy_[field];
					},
					set: (val) => {
						return self.proxy_[field] = val;
					}
				});
			}


			// Append to subscriptions.
			// var jpath = JSON.stringify(path);
			// if (!(jpath in self.subs))
			// 	self.subs[jpath] = [];
			// self.subs[jpath].push(callback);

			// Add the callback to this path and all parent paths.
			var path2 = path.slice();  // shallow copy
			while(path2.length) {

				let jpath = JSON.stringify(path2);
				if (!(jpath in self.subs_))
					self.subs_[jpath] = [];
				self.subs_[jpath].push(callback);

				path2.pop();
			}

		}

		unsubscribe(path, callback) {

			// Make sure path is an array.
			if (typeof path === 'string')
				path = parseVars(path)[0];

			// Remove the callback from this path and all parent paths.
			var path2 = path.slice(); // shallow copy
			while(path2.length) {
				let jpath = JSON.stringify(path2);
				if (jpath in this.subs_) {

					// Remove the callback from the subscriptions
					if (callback) {
						let callbackIndex = this.subs_[jpath].indexOf(callback);
						this.subs_[jpath].splice(callbackIndex, 1); // splice() modifies array in-place
					}

					// Remove the jpath from subs when last callback unsubscribes.
					if (!callback || !this.subs_[jpath].length) {

						// Undo the Object.defineProperty() call.
						delete this.obj_[path2[0]];
						this.obj_[path2[0]] = this.proxy_[path2[0]];

						// Remove the property from the subscriptions.
						delete this.subs_[jpath];
					}
				}

				path2.pop();
			}
		}
	}

	// Keeps track of which objects we're watching.
	// That way watch() and unwatch() can work without adding any new fields to the objects they watch.
	var watched = new WeakMap();

	/**
	 *
	 * @param obj {object}
	 * @param path {string|string[]}
	 * @param callback {function(action:string, path:string[], value:string?)} */
	function watch(obj, path, callback) {
		var wp;
		if (!watched.has(obj)) {
			wp = new WatchProperties(obj);
			watched.set(obj, wp);
		}
		else
			wp = watched.get(obj);

		wp.subscribe(path, callback);
	}

	/**
	 *
	 * @param obj {object}
	 * @param path {string|string[]}
	 * @param callback {function=} If not specified, all callbacks will be unsubscribed. */
	function unwatch(obj, path, callback) {
		var wp = watched.get(obj);
		if (wp) {
			wp.unsubscribe(path, callback);

			// Remove from watched objects if we're no longer watching
			if (!Object.keys(wp.subs_).length)
				watched.delete(obj);
		}
	}

	/**
	 * This function is unused.
	 * Get a property from a watched object, bypassing the proxy.
	 * If the returned value is changed, no callbacks will be called.
	 * @param obj {object}
	 * @param path {string[]}
	 * @returns {*} */
	/*
	function watchlessGet(obj, path) {
		let node = watched.get(obj).fields_;
		while (path.length)
			node = node[path.shift()];
		return node;
	}*/

	function watchlessSet(obj, path, val) {
		let node =  watched.get(obj).fields_;
		let prop = path.slice(-1)[0];
		for (let p of path.slice(0, -1))
			node = node[p];

		return node[prop] = val;
	}



	// --------------------------------------------------------------------------------------
	// Utility functions
	// --------------------------------------------------------------------------------------

	function createEl(html) {
		var div = document.createElement('div');
		div.innerHTML = html;
		return div.removeChild(div.firstChild);
	}

	/**
	 * Is name a valid attribute for el.
	 * @param el
	 * @param name
	 * @returns {boolean} */
	function isValidAttribute(el, name) {
		if (name.startsWith('data-') || el.hasAttribute(name))
			return true;
		if (name in el)
			return false;

		// Try setting the prop to see if it creates an attribute.
		el[name] = 1;
		var isAttr = el.hasAttribute(name);
		delete el[name];
		return isAttr;
	}

	function parentIndex(el) {
		if (!el.parentNode)
			return 0;
		return Array.prototype.indexOf.call(el.parentNode.children, el);
	}

	// Shortened version of this answer: stackoverflow.com/a/18751951
	var events = Object.keys(document.__proto__.__proto__)
		.filter((x) => x.startsWith('on'))
		.map(   (x) => x.slice(2));



	// --------------------------------------------------------------------------------------
	// XElement
	// --------------------------------------------------------------------------------------

	/**
	 * Process all the data- attributes.
	 * @param self {XElement}
	 * @param context {object<string, string>=}
	 * @param el {HTMLElement} */
	function bind(self, el, context) {
		var foreach, item;

		// Traverse through all parents to build the loop context.
		if (!context) {
			context = {};
			let parent = el;
			let lastParent = el;

			// Parent.host lets us traverse up beyond the shadow root, in case data-loop is defined on the shadow host.
			while (parent = (parent.host || parent.parentNode)) {

				// Shadow root documnet fragment won't have getAttrbute.
				let code =  parent.getAttribute && parent.getAttribute('data-loop');
				if (code) {

					// As we traverse upward, we set the index of variables.
					let [foreach2, item2] = parseLoop(code);
					context[item2] = foreach2 + '[' + parentIndex(lastParent) + ']';

					lastParent = parent;
				}
				if (parent.connectedCallback)
					break;
			}
		}

		// Seach attributes for data- bindings.
		if (el.attributes) // shadow root has no attributes.
			for (let attr of el.attributes) {
				if (attr.name.substr(0, 5) === 'data-') {
					let attrName = attr.name.substr(5); // remove data- prefix.
					let code = attr.value;

					// Replace loopVars
					if (attr.name === 'data-loop') { // only the foreach part of a data-loop="..."
						var [foreach2, loop2] = parseLoop(code);
						foreach2 = replaceVars(foreach2, context);
						code = foreach2 + ':' + loop2;
					}
					else
						code = replaceVars(code, context);


					// Handle a new loop.
					if (attr.name === 'data-loop') {
						[foreach, item] = parseLoop(code);

						if (item in context)
							throw new Error('Loop variable "' + item + '"already declared in an outer scope.');
					}

					// Allow the "this." prefix to be optional for simple vars.
					if (isSimpleVar_(code) && !code.trim().startsWith('this'))
						code = 'this.' + code;

					// If we have a dataAttr function to handle this specific data- attribute name.
					if (XElement.dataAttr[attrName])
						XElement.dataAttr[attrName].call(self, self, code, el);

					// Otherwise just use the dataAttr.attr function.
					else
						XElement.dataAttr.attr.call(self, self, code, el, attrName);
				}
			}

		let root = el;
		if (el.shadowRoot)
			root = el.shadowRoot;

		for (let i = 0; i < root.children.length; i++) {
			if (foreach)
				context[item] = foreach + '[' + i + ']';
			bind(self, root.children[i], context);
		}

		// Remove the loop context after we traverse outside of it.
		if (item)
			delete context[item];
	}

	function unbind(self, root) {
		var els = [...root.querySelectorAll('*')];
		if (root.attributes)
			els.unshift(root);

		for (let el of els) {
				for (let attr of el.attributes) {
					if (attr.name.substr(0, 5) === 'data-') {
						let code = attr.value;

						if (attr.name === 'data-loop') // only the foreach part of a data-loop="..."
							code = parseLoop(code)[0];

						// Allow the "this." prefix to be optional for simple vars.
						//if (isSimpleVar(code) && !code.startsWith('this'))
						//	code = 'this.' + code;

						var paths = parseVars(code);
						for (let path of paths)
							unwatch(self, path);
					}
				}
		}
	}

	/**
	 * We rebind event attributes because otherwise there's no way
	 * to make them call the class methods.
	 * @param self {XElement}
	 * @param root {HTMLElement} */
	function bindEvents(self, root) {

		var els = [...root.querySelectorAll('*')];
		if (root.attributes)
			els.unshift(root);

		for (let el of els) {
			for (let event_ of events) {

				let code = el.getAttribute('on' + event_);
				if (code) {

					// If it's a simple function that exists in the parent class,
					// add the "this" prefix.
					if (isSimpleCall_(code) && !code.trim().startsWith('this')) {
						let path = parseVars(code, false, true)[0];
						if (path && traversePath(self, path) instanceof Function)
							code = 'this.' + code;
					}

					// The code in the attribute can reference:
					// 1. event, assigned to the current event.
					// 2. this, assigned to the class instance.
					el.addEventListener(event_, function (event) {
						eval(code);
					}.bind(self));

					// Remove the original version so it doesn't also fire.
					el.removeAttribute('on' + event_);
				}
			}
		}
	}

	function initHtml(self) {
		if (self.init_)
			return;

		// 1. Set attributes and html children.
		var html = self.constructor._html;  // _html is set from ClassName.html = '...'

		// Instantiate html string.
		var div = createEl(html.trim());

		// Merge attributes on definition (Item.html='<div attr="value"') and instantiation (<x-item attr="value">).
		var attributes = {};
		for (let attr of div.attributes)
			attributes[attr.name] = attr.value;
		for (let attr of self.attributes)
			attributes[attr.name] = attr.value;

		// Copy attributes from htmlDiv to this class as either properties (if they exist) or html attributes.
		// It'd be nice to be able to pass them as constructor args, but haven't figured out a way yet.
		for (let name in attributes) {

			// Copy to class properties.
			// This doesn't work because the properties aren't created until after initHtml() is called.
			let value = attributes[name];
			if (!isValidAttribute(self, name)) {
				let arg = value;

				// As javascript code to be evaluated.
				if (arg && arg.length > 2 && arg.substr(0, 1) === '{' && arg.substr(arg.length - 1) === '}') {
					(() => { // Guard scope before calling eval.
						arg = eval('(' + arg.substr(1, arg.length - 2) + ')'); // code to eval
					}).call(self); // Import "self" as "this" variable to eval'd code.  This lets us pass attribute="${this}" in html initialization.
				}
				else
					self[name] = arg;
			}

			// Copy attribute as an attribute.
			else if (name !== undefined)
				self.setAttribute(name, attributes[name]);
		}



		// Shadow DOM:
		self.attachShadow({mode: 'open'});

		while (div.firstChild)
			self.shadowRoot.appendChild(div.firstChild);

		var root = self.shadowRoot || self;

		/*


		// Html within <x-classname>...</x-classname>, where the tag is added to another element.
		// This only works in the Edge shim.  It's an empty string in chrome and firefox.
		var slotHtml = self.innerHTML;
		var slot = div.querySelector('#slot');
		if (slot)
			slot.removeAttribute('id');

		// Copy children from temporary div to this class.
		if (slot || !slotHtml) {
			self.innerHTML = '';
			while (div.firstChild)
				self.appendChild(div.firstChild);
		}

		// Copy children from <x-classname> into the slot.
		if (slotHtml)
			(slot || self).innerHTML = slotHtml;

		*/



		// 2. Create class properties that reference any html element with an id tag.
		var nodes = root.querySelectorAll('[id]');
		for (let i = 0, node; node = nodes[i]; i++) {
			let id = node.getAttribute('id');
			//self[id] = node;
			Object.defineProperty(self, id, { // Make it readonly.
				get: function() {
					return node;
				},
				set: function() {
					throw new Error('Reassigning id properties is not supported.');
					// TODO: Allow replacing DOM node and updating reference to it.
				}
			});
			if (!self.shadowRoot)
				node.removeAttribute('id');
		}

		// 3. Bind all data- attributes
		bind(self, self);

		bindEvents(self, root);


		self.init_ = true;
	}

	/**
	 * Inherit from this class to make a custom HTML element.
	 * If you extend from XElement, you can't instantiate your class unless you first set the html property.
	 * This is because XElement extends from HTMLElement, and setting the .html property calls customElements.define().
	 *
	 * 1.  Embedding:
	 *
	 * 1.  Html:  Any html assigned to this class's html property will be created
	 *
	 * 2.  Attributes
	 *
	 * 3.  id's.  read-only.
	 *
	 * 4.  <slot> anonymous and named.
	 *
	 * 5.  data-bind
	 *     simple variables and automatic this.
	 *
	 * 6.  Events.  "this" and "event" var rewiring.
	 *
	 *
	 *
	 * 1.  Any of the element's attributes will be assigned to the instance's properties.
	 *     If an attribute is JavaScript code surrounded within "{" and "}", then that code
	 *     will be evaluated and assigned to the property rather than a string.
	 * 3.  If innerHtml is set, this innerHtml will be given to the element.
	 *     Otherwise it will take on the child nodes where it's embedded.
	 * 4.  If the innerHtml has elements with id's, these elements will be assigned
	 *     to properties of the class with the same name. */
	class XElement extends HTMLElement {

		constructor() {
			try {
				super();
			} catch (error) {
				if (error instanceof TypeError) // Add helpful message to error:
					error.message += "\nMake sure to set the .html property before instantiating this class.";
				throw error;
			}

			// Only initHtml on construction if not instantiated wit
			// If it's instantiated with new ClassName() instead of via <x-classname>,
			// then bind the html right away.  That way we can reference the html in JavaScript before we add
			// it to the DOM.
			// However, <x-classname> would fail if we gave it children in the constructor instead of in connectedCallbac()
			if (document.currentScript)
				initHtml(this);
		}

		connectedCallback() {
			// If we don't wait for DomContentLoaded,
			// initHtml() will be called before the browser adds <x-classitem>'s children,
			// and it won't be able to properly reparent those children to within a slot.
			// If this doesn't work, see https://github.com/WebReflection/html-parsed-element/blob/master/index.js
			// for a possible alternative.
			// Would it be faster to use setTimeout(function() {...} ?
			var self = this;
			var c = 'DOMContentLoaded';
			var init = () => {
				initHtml(self);
				document.removeEventListener(c, init);
			};
			document.addEventListener(c, init);
		}
	}


	XElement.dataAttr = {

		// Special 2-way binding
		val: function (self, code, el) {

			// Change class field when input value changes, only if a simple var.
			var vars = parseVars(code);
			if (vars.length === 1 && isSimpleVar_(code))
				el.addEventListener('input', () => {
					let value;
					if (el.tagName === 'SELECT')
						value = el.selectedIndex >= 0 ? el.options[el.selectedIndex].value : null;
					else if (el.getAttribute('type') === 'checkbox')
						value = el.checked;
					else
						value = el.value || el.innerHTML || '';

					watchlessSet(self, vars[0], value); // works for input, select, textarea, [contenteditable]
				});

			// Change input when class field changes.
			for (let path of vars)
				watch(self, path, ()=> {
					if (el.getAttribute('type') === 'checkbox')
						// noinspection EqualityComparisonWithCoercionJS
						el.checked = eval(code) == true;
					else
						el.value = eval(code);
				});
		},

		html: function (self, code, el) {
			for (let path of parseVars(code)) {
				watch(self, path, ()=> {
					el.innerHTML = eval(code);
				});
			}
		},

		text: function (self, code, el) {
			for (let path of parseVars(code)) {
				watch(self, path, ()=> {
					el.textContent = eval(code);
				});
			}
		},

		loop: function (self, code, el) {
			if (el.shadowRoot)
				el = el.shadowRoot;


			// Parse code into foreach parts.
			var loopVar;
			[code, loopVar] = parseLoop(code);

			// The code we'll loop over.
			var html = el.innerHTML.trim();


			var rebuildChildren = (function (action, path, value) {

				// Remove all children.
				// TODO: Use rebuildChildren args to only modify children that have changed.
				// Otherwise iterating and adding one item at a time will keep clearing and
				// resetting thie children at each iteration!
				while (el.lastChild) {
					if (el.lastChild.nodeType === 1)
						// If we don't unbind, changing the array will still updated these detached elements.
						// This will cause errors because these detached elements can't traverse upward to find their array contexts.
						unbind(self, el.lastChild);
					el.removeChild(el.lastChild);
				}

				// Recreate all children.
				if (html.length)
					for (let i in eval(code)) {
						let child = createEl(html);
						el.appendChild(child);
						bind(self, child);
					}
			}).bind(self);

			// Set initial children
			rebuildChildren.call(self);

			// Rebuild children when watched item changes.
			for (let path of parseVars(code)) {
				watch(self, path, rebuildChildren);
			}
		},

		/*
		'cls': function(self, field, el) {}, // data-cls="house.big" // Adds or removes the big class when the house.big var is true or false.
		'style': function(self, field, el) {}, // Can point to an object to use for the style.
		'if': function(self, field, el) {}, // Element is added and removed when data-if="code" evaluates to true or false.
		'visible':
		*/

		/**
		 * When self.field changes, update the value of <el attr>.
		 * This binding is used if one of the other names above isn't matched.
		 * @param self {XElement}
		 * @param code {string}
		 * @param el {HTMLElement}
		 * @param attr {string} Name of the attribute on el that's being bound.  Doesn't include 'data-' prefix. */
		attr: function (self, code, el, attr) {

			// If the variables in code, change, execute the code.
			// Then set the attribute to the value returned by the code.
			for (let path of parseVars(code))
				watch(self, path, ()=> { // slice() to remove this.
					var result = eval(code);
					if (result === false)
						el.removeAttribute(attr);
					else
						el.setAttribute(attr, result + '');
				});
		}
	};

	/**
	 * Override the static html property so we can call customElements.define() whenever the html is set.*/
	Object.defineProperty(XElement, 'html', {
		get: function () {
			return this._html;
		},
		set: function (html) {
			var self = this;

			// TODO: We want to be able to do:
			// <x-item arg1="1", arg2="2">
			// And have those passed to Item's constructor.
			// Here we can get the names of those arguments, but how to intercept the browser's call to the constructor?
			// Below I tried to work around this by subclassing.
			// But we can't get a reference to the <x-item> to read its attributes before the super() call.
			// function getConstructorArgs(func) {
			// 	return func.toString()  // stackoverflow.com/a/14660057
			// 		.replace(/((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg,'') // Remove comments. TODO: Also remove strings.
			// 		.match(/^\s*constructor\s*\(\s*([^)]*)\)\s*{/m)[1] // submatch "constructor(...) {"
			// 		.split(/\s*,\s*/);
			// }
			// var args = getConstructorArgs(this);
			//
			// class Embedded extends this {
			// 	constructor() {
			// 		var attrib0 = this.getAttribute(args[0]); // fails.  Can't use "this".
			// 		super(attrib0);
			// 	}
			// }

			var name = 'x-' + self.name.toLowerCase();

			// If name exists, add an incrementing integer to the end.
			for (let i = 2; customElements.get(name); i++)
				name = 'x-' + self.name.toLowerCase() + i;

			// New way where we pass attributes to teh constructor:
			// customElements.define(name, Embedded);
			// customElements.define(name+'-internal', this);

			// Old way:
			customElements.define(name, self);

			self._html = html;
		}
	});

	// Exports
	window.XElement = XElement;
})();