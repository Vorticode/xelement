/*
Inherit from XElement to create custom HTML Components.

TODO
Fix failing Edge tests.
bind to drag/drop events, allow sortable?
implement other binding functions.
allow index in data-loop
allow loop over more than one item.
cache results of parseVars() and other parse functions?
cache the context of loop vars.

create from <template> tag
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
What if an xelment is embeded in another, and the inner element has a data-binding.  Which one does it apply to?
If specified on its definition?  If the data-binding is on its embed?
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
 * Traverse through all parents to build the loop context.
 * TODO: We could maybe speed things up by having a weakmap<el, context:object> that caches the context of each loop?
 * @param el
 * @return {object<string, string>} */
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
			let [foreach, item] = parseLoop(code);
			foreach = addThis(foreach);
			if (item in context)
				throw new Error('Loop variable "' + item + '" already used in a parent loop.');

			// As we traverse upward, we set the index of variables.
			if (lastEl)
				context[item] = foreach + '[' + parentIndex(lastEl) + ']';
		}

		// If not a DocumentFragment from the ShadowRoot.
		if (parent.getAttribute)
			lastEl = parent;

		// Stop once we reach an XElement.
		if (parent instanceof XElement)
			break;
	}
	return context;
};


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
	var foreach, item;


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
				if (attr.name === 'data-loop') { // only the foreach part of a data-loop="..."

					// Don't do data-loop binding for nested XElements.  They will do their own binding.
					if (el !== self && el instanceof XElement)
						continue;

					// Replace vars only in the part of the foreach loop before the ":"
					// This is necessary for inner nested loops.
					[foreach, item] = parseLoop(code);
					foreach = replaceVars(foreach, context);
					foreach = addThis(foreach, context);
					code = foreach + ':' + item;
				}
				else {
					code = replaceVars(code, context);
					code = addThis(code, context);
				}


				// If we have a dataAttr function to handle this specific data- attribute name.
				if (XElement.dataAttr[attrName])
					XElement.dataAttr[attrName].call(self, self, code, el);

				// Otherwise just use the dataAttr.attr function.
				else
					XElement.dataAttr.attr.call(self, self, code, el, attrName);
			}
		}

	// Allow traversing from host element into its own shadowRoot
	// But not into the shadow root of other elements.
	let root = el;
	if (el===self && el.shadowRoot)
		root = el.shadowRoot;

	for (let i = 0; i < root.children.length; i++) {

		// Add to context as we descend.
		if (foreach)
			context[item] = foreach + '[' + i + ']';
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

				if (attr.name === 'data-loop') // only the foreach part of a data-loop="..."
					code = parseLoop(code)[0];

				code = replaceVars(code, context);
				var paths = parseVars(code);

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
		els.unshift(root); // Add root if it's not a DocumentFragment.

	for (let el of els) {
		for (let event_ of events) {

			let code = el.getAttribute('on' + event_);
			if (code) {

				// If it's a simple function that exists in the parent class,
				// add the "this" prefix.
				let path = parseVars(code, 0, 1)[0];
				if (path && traversePath(self, path) instanceof Function)
					code = addThis(code, getContext(el), isSimpleCall_);

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
};

var initHtml = (self) => {
	if (self.init_)
		return;
	self.init_ = 1;

	// 1. Set attributes and html children.
	// Instantiate html string.
	var div = createEl(self.constructor._html.trim()); // _html is set from ClassName.html = '...'

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
			if (arg && arg.length > 2 && arg.slice(0, 1) === '{' && arg.slice(-1) === '}') {
				(() => { // Guard scope before calling eval.
					arg = eval('(' + arg.slice(1, -1) + ')'); // code to eval
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
		Object.defineProperty(self, id, { // Make it readonly.
			value: node,
			writable: 0
		});

		// Only leave the id attributes if we have a shadow root.
		// Otherwise we'll have duplicate id's in the main document.
		if (!self.shadowRoot)
			node.removeAttribute('id');
	}

	// 3. Bind all data- and event attributes
	bind(self, self);
	bindEvents(self, root);
};

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
 * 6.  Events.  "this" and "event" var rewiring, event.target.
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
				error.message += '\nMake sure to set the .html property before instantiating the class "' + this.name + '".';
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
	val: (self, code, el) => {

		// Update object property when input value changes, only if a simple var.
		var vars = parseVars(code);
		if (vars.length === 1 && isSimpleVar_(code))
			el.addEventListener('input', () => {
				let value;
				if (el.getAttribute('type') === 'checkbox')
					value = el.checked;
				else
					value = el.value || el.innerHTML || ''; // works for input, select, textarea, [contenteditable]

				watchlessSet(self, vars[0], value);
			});

		let setVal = function(/*action, path, value*/) {
			if (el.getAttribute('type') === 'checkbox')
				// noinspection EqualityComparisonWithCoercionJS
				el.checked = eval(code) == true;
			else
				el.value = eval(code);
		}.bind(self);

		// Update input value when object property changes.
		for (let path of vars) {
			watch(self, path, setVal);
			addWatchedEl(el, setVal);
		}

		// Set initial value.
		setVal();
	},

	html: (self, code, el) => {
		let setHtml = function(/*action, path, value*/) {
			el.innerHTML = eval(code);
		}.bind(self);

		for (let path of parseVars(code)) {
			watch(self, path, setHtml);
			addWatchedEl(el, setHtml);
		}

		// Set initial value.
		setHtml();
	},

	text: (self, code, el) => {
		let setText = function(/*action, path, value*/) {
			el.textContent = eval(code);
		}.bind(self);
		for (let path of parseVars(code)) {
			watch(self, path, setText);
			addWatchedEl(el, setText);
		}

		// Set initial value.
		setText();
	},

	loop: (self, code, el) => {
		if (el.shadowRoot)
			el = el.shadowRoot;


		// Parse code into foreach parts.
		var loopVar;
		[code, loopVar] = parseLoop(code);
		var paths = parseVars(code);
		var isSimple = isSimpleVar_(code);

		// The code we'll loop over.
		var html = el.innerHTML.trim();


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

			if (path)
				var index = getModifiedIndex(path);

			// If code is a simple var and path modifies only one item:
			if (path && index >= 0) {
				let existingChild = el.children[index];

				if (action === 'set') { // add or replace item.
					let newChild = createEl(html);
					el.insertBefore(newChild, existingChild); // if existingChild is null, will be inserted at end.
					bind(self, newChild);
					bindEvents(self, newChild);
				}

				if (existingChild) { // action==='delete' or removing item replaced by set.
					unbind(self, existingChild);
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
				if (html.length)
					for (let i in eval(code)) {
						let child = createEl(html);
						el.appendChild(child);

						bind(self, child);
						bindEvents(self, child);
					}
			}
		}

		// Remove children before calling rebuildChildren()
		// That way we don't unbind elements that were never bound.
		while (el.lastChild)
			el.removeChild(el.lastChild);

		// Set initial children
		rebuildChildren.call(self);

		// Rebuild children when watched item changes.
		for (let path of paths) {
			watch(self, path, rebuildChildren);
			addWatchedEl(el, rebuildChildren);
		}
	},

	/*
	'cls': function(self, field, el) {}, // data-cls="{house: 'big'}" // Adds or removes the big class when the house property is true.
	'style': function(self, field, el) {}, // Can point to an object to use for the style.
	'if': function(self, field, el) {}, // Element is created or destroyed when data-if="code" evaluates to true or false.
	'visible':
	'sortable': // TODO use sortable.js and data-sortable="{sortableOptionsAsJSON}"
	*/

	/**
	 * When self.field changes, update the value of <el attr>.
	 * This binding is used if one of the other names above isn't matched.
	 * @param self {XElement}
	 * @param code {string}
	 * @param el {HTMLElement}
	 * @param attr {string} Name of the attribute on el that's being bound.  Doesn't include 'data-' prefix. */
	attr: (self, code, el, attr) => {

		let setAttr = function(/*action, path, value*/) {
			var result = eval(code);
			if (result === false || result === null || result === undefined)
				el.removeAttribute(attr);
			else
				el.setAttribute(attr, result + '');

		}.bind(self);

		// If the variables in code, change, execute the code.
		// Then set the attribute to the value returned by the code.
		for (let path of parseVars(code)) {
			watch(self, path, setAttr);
			addWatchedEl(el, setAttr);
		}

		setAttr();
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

		return self._html = html;
	}
});

// Exports
window.XElement = XElement;