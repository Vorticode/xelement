/*
Inherit from XElement to create custom HTML Components.


TODO
Make data- prefix optional.  Move attributes to data-attr="..." like data-classes.
Fix failing Edge tests.
Separate "this" binding for data attr on definition vs instantiation.
Make shadowdom optional.
indexOf and includes() on arrays fail because they compare proxied objects.

bind to drag/drop events, allow sortable?
implement other binding functions.
allow loop over slots if data-loop is on teh instantiation.
allow loop over more than one html tag.
cache results of parseVars() and other parse functions?
cache the context of loop vars.
functions to enable/disable updates.
function to trigger updates?

create from <template> tag
When a change occurs, create a Set of functions to call, then later call them all.
	That way we remove some duplicate updates.
Auto bind to this in complex expressions if the class property already exists and the var is otherwise undefined?
improve minifcation.
speed up data-loop by only modifying changed elements for non-simple vars.
Expose dataAttr in minified version.
non-ascii variable names.
throttle, debounce?
Auto two-way bind for simple variables?
bind to <input type="file">
bind to clipboard events
Named slot support? - https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_templates_and_slots
Separate out a lite version that doesn't do binding?
	This would also make the code easier to follow.  But what to call it?  XEl ? XElementLite?
TODO:

We could even add enableUpdates() / disableUpdates() / clearUpdates() functions.




Disadvantages of Vue.js
10x larger.
Requires a single, special root component everything else must be within.
Doesn't use es6 classes.
Requires data and methods, can't bind directly to class props.
Doesn't support ShadowDOM, only emulates nested styles.
Requires key="" attributes everywhere to make identical elements unique.
Vue.js doesn't watch array indices or object property add/remove!
   You have to call Vue.set(array...)
data: {} items shared between each component instance, unless it's wrapped in a function.

Advantages of Vue.js
Fast and debugged.
Widespread use.
IDE support
---
{{ templates }} for plain text.
transition effects
Automatically adds vendor prefixes for data-styles="" binding.
key/value iteration over objects.
Checkboxes and multi-select to array of names.
lazy modifier for input binding, to only trigger update after change.

*/



// A map between elements and the callback functions subscribed to them.
// This way when we remove an element we know what to unbind.
var watchedEls = new WeakMap();

var addWatchedEl = (el, callback) => {
	if (!watchedEls.has(el))
		watchedEls.set(el, [callback]);
	else
		watchedEls.get(el).push(callback);
};


/**
 * @param cls {Function}
 * @returns {string} */
var getXName = (cls) => {
	if (!cls.xname) {
		let lname = cls.name.toLowerCase();
		if (lname.startsWith('x'))
			lname = lname.slice(1);

		let name = 'x-' + lname;

		// If name exists, add an incrementing integer to the end.
		for (let i = 2; customElements.get(name); i++)
			name = 'x-' + lname + i;

		cls.xname = name;
	}
	return cls.xname;
};

var getXParent = (el) => {
	do {
		if (el.nodeType === 11) // doc fragment
			return el.host;
	} while (el = el.parentNode);
};

/**
 * Traverse through all parents to build the loop context.
 * TODO: We could maybe speed things up by having a weakmap<el, context:object> that caches the context of each loop?
 * @param el
 * @return {object<string, string|int>} */
var getContext = (el) => {
	let context = {};
	let parent = el;
	let lastEl = el;

	// Parent.host lets us traverse up beyond the shadow root, 
	// in case data-loop is defined on the shadow host.
	// We also start by checking the parent for the context instead of this element,
	// because an element only sets its context for its children, not itself.
	while (parent = (parent.host || parent.parentNode)) {

		// Shadow root documnet fragment won't have getAttrbute.
		let code = parent.getAttribute && parent.getAttribute('data-loop');
		if (code) {

			// Check for an inner loop having the same variable name
			let [foreach, itemVar, indexVar] = parseLoop(code);
			foreach = addThis(foreach);
			//#IFDEV
			if (itemVar in context)
				throw new XElementError('Loop variable "' + itemVar + '" already used in a parent loop.');
			if (indexVar && indexVar in context)
				throw new XElementError('Loop index "' + indexVar + '" already used in a parent loop.');
			//#ENDIF

			// As we traverse upward, we set the index of variables.
			if (lastEl) {
				let index = parentIndex(lastEl);
				context[itemVar] = foreach + '[' + index + ']';
				if (indexVar) // will be undefined if it doesn't exist.
					context[indexVar] = index;
			}
		}

		// If not a DocumentFragment from the ShadowRoot.
		if (parent.getAttribute)
			lastEl = parent;

		// Stop once we reach an XElement.
		if (parent.dataAttr)
			break;
	}
	return context;
};

/**
 * This new version could calculate the context dynamically,
 * and should work even if nodes are moved around.
 * @param el
 */
var getContext2 = function(el) {};


/**
 * Process all the data- attributes in el and its descendants.
 * @param self {XElement}
 * @param el {HTMLElement}
 * @param context {object<string, string>=} A map of loop variable names to their absolute reference.
 * This allows us to do variable replacement:
 *     <div>data-loop="this.items : item">
 *         <div data-val="item.name">
 *  The looped item becomes:
 *         <div data-val="this.items[0].name"> */
var bind = (self, el, context) => {
	var foreach, item, indexVar;


	// Seach attributes for data- bindings.
	if (el.attributes) // shadow root has no attributes.
		for (let attr of el.attributes) {
			if (attr.name.slice(0, 5) === 'data-') {
				let attrName = attr.name.slice(5); // remove data- prefix.
				let code = attr.value;

				// Get context only if needed.
				if (!context)
					context = getContext(el);

				// Replace loopVars
				// We do this here instead of in the bind function so we can build the context as we descend.
				if (attr.name === 'data-loop') { // only the foreach part of a data-loop="..."

					// Don't do data-loop binding for nested XElements.  They will do their own binding.
					if (el !== self && el.dataAttr)
						continue;

					// Replace vars only in the part of the foreach loop before the ":"
					// This is necessary for inner nested loops.
					[foreach, item, indexVar] = parseLoop(code);
					foreach = replaceVars(foreach, context);
					foreach = addThis(foreach, context);
					if (indexVar)
						code = foreach + ':' + indexVar + ',' + item;
					else
						code = foreach + ':' + item;
				}

				// TODO: data-attr
				// TODO: This should be done in the binding function.
				else if (['data-bind', 'data-classes'].includes(attr.name)) {

				}

				else {
					code = replaceVars(code, context);
					code = addThis(code, context);
				}


				// If we have a dataAttr function to handle this specific data- attribute name.
				if (attrName === 'bind') {

					if (self !== el && el instanceof XElement)
						dataAttr[attrName].call(self, self, code, el);

				}


				else if (dataAttr[attrName])
					dataAttr[attrName].call(self, self, code, el);

				// Otherwise just use the dataAttr.attr function.
				else
					dataAttr.attr.call(self, self, code, el, attrName);
			}
		}

	// Allow traversing from host element into its own shadowRoot
	// But not into the shadow root of other elements.
	let root = el;
	if (el===self && el.shadowRoot)
		root = el.shadowRoot;

	for (let i = 0; i < root.children.length; i++) {

		// Add to context as we descend.
		if (foreach) {
			context[item] = foreach + '[' + i + ']';
			if (indexVar !== undefined)
				context[indexVar] = i;
		}

		bind(self, root.children[i], context);
	}

	// Remove the loop context after we traverse outside of it.
	if (item)
		delete context[item];
};

/**
 * @param self {XElement}
 * @param root {HTMLElement} */
var unbind = (self, root) => {
	var els = [...root.querySelectorAll('*')];
	if (root.attributes)
		els.unshift(root);

	for (let el of els) {

		for (let attr of el.attributes) {
			if (attr.name.slice(0, 5) === 'data-') {
				let code = attr.value;
				if (!context)
					var context = getContext(el);

				if (attr.name === 'data-loop') // get vars from only the foreach part of a data-loop="..."
					code = parseLoop(code)[0];

				code = replaceVars(code, context);
				let paths = parseVars(code);

				for (let path of paths)
					// watchedEls.get() returns callbacks from all paths, but unwatch only unsubscribes those of path.
					for (let callback of watchedEls.get(el) || [])
						unwatch(self, path, callback);
			}
		}
	}
};

/**
 * We rebind event attributes because otherwise there's no way
 * to make them call the class methods.
 * @param self {XElement}
 * @param root {HTMLElement} */
var bindEvents = (self, root) => {

	var els = [...root.querySelectorAll('*')];
	if (root.attributes)
		els.unshift(root); // Add root if it's not a DocumentFragment from shadowDOM

	// Traverse through every child element.
	// TODO: Don't descend into other xelements once we make shadowdom optional.
	for (let el of els) {
		bindEvents2(self, el);
	}
};

var bindEvents2 = (self, el, getAttributesFrom) => {
	getAttributesFrom = getAttributesFrom || el;

	for (let event_ of events) {

		let code = getAttributesFrom.getAttribute('on' + event_);
		if (code) {

			let context = getContext(el);
			code = replaceVars(code, context);

			// If it's a simple function that exists in the class,
			// add the "this" prefix.
			let path = parseVars(code, 0, 1)[0];
			if (path && traversePath(self, path) instanceof Function)
				code = addThis(code, context, isStandaloneCall);

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
};

var bindEvent3 = function(el, eventName, code) {
	let context = getContext(el);
	code = replaceVars(code, context);

	// If it's a simple function that exists in the class,
	// add the "this" prefix.
	let path = parseVars(code, 0, 1)[0];
	if (path && traversePath(self, path) instanceof Function)
		code = addThis(code, context, isStandaloneCall);

	// The code in the attribute can reference:
	// 1. event, assigned to the current event.
	// 2. this, assigned to the class instance.
	el.addEventListener(eventName, function (event) {
		eval(code);
	}.bind(self));

	// Remove the original version so it doesn't also fire.
	el.removeAttribute('on' + eventName);
};

var setAttribute = (self, name, value) => {

	// Copy to class properties.
	// This doesn't work because the properties aren't created until after initHtml() is called.
	if (!isValidAttribute(self, name)) {

		// As javascript code to be evaluated.
		if (value && value.length > 2 && value.slice(0, 1) === '{' && value.slice(-1) === '}') {
			(() => { // Guard scope before calling eval.
				value = eval('(' + value.slice(1, -1) + ')'); // code to eval
			}).call(self); // Import "self" as "this" variable to eval'd code.  This lets us pass attribute="${this}" in html initialization.
		}
		else
			self[name] = value;
	}

	// Copy attribute as an attribute.
	else
		self.setAttribute(name, value);
};


var setAttribute2 = function (el, name, value) {

	if (name.startsWith('data-')) {


	}
	if (events.includes(name))
		bindEvent3(el, name.slice(2), value);
	else
		el.setAttribute(name, value);

};

var initHtml = (self) => {
	if (self.init_)
		return;
	self.init_ = 1;

	// 1. Create temporary element.
	var div = createEl(self.constructor.html_.trim()); // html_ is set from ClassName.html = '...'

	// 2. Remove and save attributes from instantiation.
	var attributes = {};
	for (let attr of self.attributes) // From instantiation.
		attributes[attr.name] = attr.value;

	// 3.  Add attributes from definition (Item.html='<div attr="value"')
	for (let attr of div.attributes) { // From definition
		if (attr.name !== undefined)
			setAttribute(self, attr.name, attr.value);
	}

	// Bind events on the defintion to functions on its own element and not its container.
	bindEvents2(self, self, div);

	// 5.  Add attributes from instantiation.
	for (let name in attributes) // From instantiation
		setAttribute(self, name, attributes[name]);

	// Create Shadow DOM
	self.attachShadow({mode: 'open'});
	while (div.firstChild)
		self.shadowRoot.appendChild(div.firstChild);
	var root = self.shadowRoot || self;


	/*
	// Old version before shadow dom:
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
		Object.defineProperty(self, id, {
			// Make it readonly.
			// Using writeable: false caused errors if the getter returns a proxy instead of the proper type.
			// But how does it know it's the wrong type?

			enumerable: 1,
			configurable: 1,
			get: function() {
				return node;
			},
			set: function() {
				//#IFDEV
				throw new XElementError('Property ' + id + ' not writable');
				//#ENDIF
			}
		});

		// Only leave the id attributes if we have a shadow root.
		// Otherwise we'll have duplicate id's in the main document.
		if (!self.shadowRoot)
			node.removeAttribute('id');
	}

	// 3. Bind all data- and event attributes
	// TODO: Move bind into setAttribute above, so we can call it separately for definition and instantiation.
	//if (!self.hasAttribute('data-bind'))
	bind(self, self);
	bindEvents(self, root);

	/*
	nodes = root.querySelectorAll('[id]');
	for (let i = 0, node; node = nodes[i]; i++)

		if (node instanceof XElement) {
			node.$parent = getXParent(node);
		}
	*/

};

/**
 * Inherit from this class to make a custom HTML element.
 * If you extend from XElement, you can't instantiate your class unless you first set the html property.
 * This is because XElement extends from HTMLElement, and setting the .html property calls customElements.define(). */
class XElement extends HTMLElement {

	constructor() {
		//#IFDEV
		try {
		//#ENDIF
			super();
		//#IFDEV
		} catch (error) {
			if (error instanceof TypeError) // Add helpful message to error:
				error.message += '\nMake sure to set the .html property before instantiating the class "' + this.name + '".';
			throw error;
		}
		//#ENDIF

		// Only initHtml on construction if not instantiated wit
		// If it's instantiated with new ClassName() instead of via <x-classname>,
		// then bind the html right away.  That way we can reference the html in JavaScript before we add
		// it to the DOM.
		// However, <x-classname> would fail if we gave it children in the constructor instead of in connectedCallbac()
		if (document.currentScript)
			initHtml(this);

		let xname = getXName(this.constructor);
		let self = this;
		if (customElements.get(xname))
			initHtml(self);
		else
			customElements.whenDefined(xname).then(() => {
				initHtml(self);
			});
	}
}

// TODO: write a function to replace common code among these.
var dataAttr = {

	/**
	 * When self.field changes, update the value of <el attr>.
	 * This binding is used if one of the other names above isn't matched.
	 * @param self {XElement}
	 * @param code {string}
	 * @param el {HTMLElement}
	 * @param attr {string} Name of the attribute on el that's being bound.  Doesn't include 'data-' prefix. */
	attr: (self, code, el, attr) => {

		let setAttr = function(/*action, path, value*/) {
			var result = safeEval.call(self, code);
			if (result === false || result === null || result === undefined)
				el.removeAttribute(attr);
			else
				el.setAttribute(attr, result + '');

		}.bind(self);

		// If the variables in code, change, execute the code.
		// Then set the attribute to the value returned by the code.
		for (let path of parseVars(code)) {
			watchXElement(self, path, setAttr);
			addWatchedEl(el, setAttr);
		}

		setAttr();
	},


	bind: (self, code, el) => {
		// Temporary.  Put this in its own function or something.
		var obj = parseObj(code);
		var context = getContext(el);
		for (let name in obj)
			obj[name] = addThis(replaceVars(obj[name], context), context);
		code = joinObj(obj);

		let assignments = code/*.replace(/^{|}$/g, '')*/.split(/;/g).map((x) => x.trim().split(/\s*:/g));

		for (let assignment of assignments) {
			let expr = addThis(assignment[1]);
			let prop = assignment[0];

			// This code is called on every update.
			let updateProp = function updateProp(action, path, value) {
				let result = safeEval.call(self, expr);
				el[prop] = result;

			}.bind(self);

			// Create properties and watch for changes.
			// if expr is "this", we won't watch anything since we can only watch props not objects.
			for (let path of parseVars(expr))
				watch(self, path, updateProp);

			// Set initial values.
			updateProp();
		}

		// These were called once when we were instantiated.
		// But with a new variable bound we have to redo them.
		// TODO: Modify initHtml to not bind if the data-bind attribute is present on the instantiation.
		unbind(el, el);
		bind(el, el);
	},

	classes: (self, code, el) => {

		// Temporary.  Put this in its own function or something.
		var obj = parseObj(code);
		var context = getContext(el);
		for (let name in obj)
			obj[name] = addThis(replaceVars(obj[name], context), context);

		code = joinObj(obj);

		// remove leading and trailing {}.
		// Split on ;
		// Split on :
		// No need for \s* after : because parseVars can handle it.
		let assignments = code/*.replace(/^{|}$/g, '')*/.split(/;/g).map((x) => x.trim().split(/\s*:/g));



		for (let cls of assignments) {
			let classExpr = addThis(cls[1]);

			// This code is called on every update.
			let updateClass = function() {
				let result = safeEval.call(self, classExpr);
				if (result)
					el.classList.add(cls[0]);
				else {
					el.classList.remove(cls[0]);
					if (!el.classList.length) // remove attribute after last class removed.
						el.removeAttribute('class');
				}
			}.bind(self);

			// Create properties and watch for changes.
			for (let path of parseVars(classExpr)) {
				//traversePath(self, path, true); // Create properties.
				watch(self, path, updateClass);
			}

			// Set initial values.
			updateClass();
		}
	},

	text: (self, code, el) => {
		let setText = function setText(action, path, value) {

			el.textContent = safeEval.call(self, code);
		};
		for (let path of parseVars(code)) {
			watchXElement(self, path, setText);
			addWatchedEl(el, setText);
		}

		// Set initial value.
		setText();
	},

	html: (self, code, el) => {
		let setHtml = function setHtml(action, path, value) {
			el.innerHTML = safeEval.call(self, code);
		};

		for (let path of parseVars(code)) {
			watch(self, path, setHtml);
			addWatchedEl(el, setHtml);
		}

		// Set initial value.
		setHtml();
	},



	loop: (self, code, el) => {

		if (el.shadowRoot)
			el = el.shadowRoot;



		// Parse code into foreach parts.
		var loopVar;
		[code, loopVar] = parseLoop(code);
		var paths = parseVars(code);
		var isSimple = isStandaloneVar(code);

		// The code we'll loop over.
		// We store it here because innerHTML is lost if we unbind and rebind.
		if (!el.loopHtml)
			el.loopHtml = el.innerHTML.trim();


		var getModifiedIndex = (path) => {
			// Can't calc for non-simple var.
			// Can't calc if path doesn't match simple var path.
			if (!isSimple || !arrayEq(path.slice(0, -1), paths[0]))
				return -1;

			return parseInt(path[path.length-1]);
		};

		function rebuildChildren(action, path, value) {

			// TODO: Keep all elements the same and only update bound values?
			// Then we only need to add and remove items from the end of the children.
			// But this would break unbound inputs when removing from the middle of the list.

			if (path) {
				// We're modifying something inside an element, don't rebuild the whole array.
				// Data binding within the element will handle these changes.
				if (path.length > paths[0].length + 1)
					return;

				var index = getModifiedIndex(path);
			}

			// If code is a simple var and path modifies only one item:
			if (path && index >= 0) {
				let existingChild = el.children[index];

				// Unbind needs to happen before existing child changes its index.
				if (existingChild) // action==='delete' or removing item replaced by set.
					unbind(self, existingChild);


				if (action === 'set') { // add or replace item.
					let newChild = createEl(el.loopHtml);
					el.insertBefore(newChild, existingChild); // if existingChild is null, will be inserted at end.
					bind(self, newChild);
					bindEvents(self, newChild);
				}

				if (existingChild) { // action==='delete' or removing item replaced by set.
					// TODO: unbindEvents()?
					el.removeChild(existingChild);
				}
			}

			// Otherwise we have to rebuild all children.
			else {

				// Remove all children.
				while (el.lastChild) {
					if (el.lastChild.nodeType === 1)
					// If we don't unbind, changing the array will still updated these detached elements.
					// This will cause errors because these detached elements can't traverse upward to find their array contexts.
					// TODO: unbindEvents()?
						unbind(self, el.lastChild);

					el.removeChild(el.lastChild);
				}

				// Recreate all children.
				if (el.loopHtml.length) {
					let result = safeEval.call(self, code);

					for (let i in result) {
						let child = createEl(el.loopHtml);
						el.appendChild(child);

						bind(self, child);
						bindEvents(self, child);
					}
				}
			}
		}

		// Remove children before calling rebuildChildren()
		// That way we don't unbind elements that were never bound.
		while (el.lastChild)
			el.removeChild(el.lastChild);

		for (let path of paths) {
			watchXElement(self, path, rebuildChildren);

			addWatchedEl(el, rebuildChildren);
		}

		// Set initial children
		rebuildChildren.call(self);
	},

	// Special 2-way binding
	val: (self, code, el) => {

		// Update object property when input value changes, only if a simple var.
		var paths = parseVars(code);
		if (paths.length === 1 && isStandaloneVar(code))
			el.addEventListener('input', () => {
				let value;
				if (el.getAttribute('type') === 'checkbox')
					value = el.checked;
				else
					value = el.value || el.innerHTML || ''; // works for input, select, textarea, [contenteditable]

				// We don't use watchlessSet in case other things are subscribed.
				traversePath(self, paths[0], true, value);
			});

		let setVal = function(action, path, value) {
			let result = safeEval.call(self, code);

			if (el.getAttribute('type') === 'checkbox')
				// noinspection EqualityComparisonWithCoercionJS
				el.checked = result == true;
			else
				el.value = result;
		}.bind(self);

		// Update input value when object property changes.
		for (let path of paths) {
			watchXElement(self, path, setVal);
			addWatchedEl(el, setVal);
		}

		// Set initial value.
		setVal();
	},

	visible: (self, code, el) => {
		var displayNormal = el.style.display;
		if (displayNormal === 'none')
			displayNormal = '';

		let setVisible = function(/*action, path, value*/) {
			el.style.display = safeEval.call(self, code) ? displayNormal : 'none';
		}.bind(self);
		for (let path of parseVars(code)) {
			watch(self, path, setVisible);
			addWatchedEl(el, setVisible);
		}

		// Set initial value.
		setVisible();
	},

	/*
	'style': function(self, field, el) {}, // Can point to an object to use for the style.
	'if': function(self, field, el) {}, // Element is created or destroyed when data-if="code" evaluates to true or false.
	'sortable': // TODO use sortable.js and data-sortable="{sortableOptionsAsJSON}"
	*/
};


/**
 * Traverse starting from path and working downward,
 * looking for an existing XElement to watch.
 * This allows the corret object to be watched when data-bind is used.
 * @param obj
 * @param path
 * @param callback */
function watchXElement(obj, path, callback) {
	for (let i=path.length; i>=0; i--) {
		let item = traversePath(obj, path.slice(0, i));
		if (item instanceof XElement) {
			watch(item, path.slice(i), callback);
			break;
		}
	}
}

/**
 * Override the static html property so we can call customElements.define() whenever the html is set.*/
Object.defineProperty(XElement, 'html', {
	get: function () {
		return this.html_;
	},
	set: function (html) {
		const self = this;

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

		// Could the customElements.whenDefined() callback be helpful?

		let name = getXName(self);

		// New way where we pass attributes to the constructor:
		// customElements.define(name, Embedded);
		// customElements.define(name+'-internal', this);

		// Old way:
		customElements.define(name, self);

		return self.html_ = html;
	}
});

// Exports
XElement.dataAttr = dataAttr;
window.XElement = XElement;