/*
Inherit from XElement to create custom HTML Components.

TODO:
speed up data-loop by only modifying changed elements.
Fix failing Edge tests.
implement other binding functions.
create from <template> tag
compress

caching:
auto cache results of parseVars() and other parse functions?
cach the context of loop vars.

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
TODO:
What if an xelment is embeded in another, and the inner element has a data-binding.  Which one does it apply to?
If specified on its definition?  If the data-binding is on its embed?
*/




/**
 * Traverse through all parents to build the loop context.
 * TODO: We could maybe speed things up by having a weakmap<el, context:object> that caches the context of each loop?
 * @param el
 * @return {object<string, string>} */
function getContext(el) {
	let context = {};
	let parent = el;
	let lastParent = el;

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
			if (item in context)
				throw new Error('Loop variable "' + item + '"already declared in an outer scope.');

			// As we traverse upward, we set the index of variables.
			context[item] = foreach + '[' + parentIndex(lastParent) + ']';

			lastParent = parent;
		}

		// Stop once we reach an XElement.
		if (parent instanceof XElement)
			break;
	}
	return context;
}

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
function bind(self, el, context) {
	var foreach, item;

	// Traverse through all parents to build the loop context.
	if (!context)
		context = getContext(el);

	// Seach attributes for data- bindings.
	if (el.attributes) // shadow root has no attributes.
		for (let attr of el.attributes) {
			if (attr.name.substr(0, 5) === 'data-') {
				let attrName = attr.name.substr(5); // remove data- prefix.
				let code = attr.value;

				// Replace loopVars
				if (attr.name === 'data-loop') { // only the foreach part of a data-loop="..."

					// Don't do data-loop binding for nested XElements.  They will do their own binding.
					if (el !== self && el instanceof XElement)
						continue;

					// Replace vars only in the part of the foreach loop before the ":"
					// This is necessary for inner nested loops.
					[foreach, item] = parseLoop(code);
					foreach = replaceVars(foreach, context);
					code = foreach + ':' + item;
				}
				else
					code = replaceVars(code, context);


				// Allow the "this." prefix to be optional for simple vars.
				// TODO: replaceVars() above already calls parseVars.
				// We can store that result and make sure paths.length is 1 before calling isSimleVar_.
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
}

/**
 * @param self {XElement}
 * @param root {HTMLElement} */
function unbind(self, root) {
	var els = [...root.querySelectorAll('*')];
	if (root.attributes)
		els.unshift(root);

	for (let el of els) {

		let context;
		for (let attr of el.attributes) {
			if (attr.name.substr(0, 5) === 'data-') {
				let code = attr.value;

				if (attr.name === 'data-loop') // only the foreach part of a data-loop="..."
					code = parseLoop(code)[0];

				// Allow the "this." prefix to be optional for simple vars.
				//if (isSimpleVar(code) && !code.startsWith('this'))
				//	code = 'this.' + code;
				if (!context)
					context = getContext(el);
				code = replaceVars(code, context);
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

	// 3. Bind all data- and event attributes
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
	val: function (self, code, el) {

		// Update object property when input value changes, only if a simple var.
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

		// Update input value when object property changes.
		for (let path of vars) {
			watch(self, path, (action, actionPath, val) => {
				//console.log(action, actionPath, val);

				// Sometimes action="set" is called on a parent path and we receive no "delete"
				if (traversePath(self, path) === undefined) {
					if (el.getAttribute('type') === 'checkbox')
						el.checked = false;
					else
						el.value = '';
				}
				else {
					if (el.getAttribute('type') === 'checkbox')
						// noinspection EqualityComparisonWithCoercionJS
						el.checked = eval(code) == true;
					else
						el.value = eval(code);
				}
			});

			// Set initial value.
			(function () {
				if (traversePath(self, path) === undefined) {
					if (el.getAttribute('type') === 'checkbox')
						el.checked = false;
					else
						el.value = '';
				}
				else {
					if (el.getAttribute('type') === 'checkbox')
						// noinspection EqualityComparisonWithCoercionJS
						el.checked = eval(code) == true;
					else
						el.value = eval(code);
				}
			}).bind(this)();
		}
	},

	html: function (self, code, el) {
		for (let path of parseVars(code)) {
			watch(self, path, (action, actionPath, value) => {
				el.innerHTML = traversePath(self, path) === undefined ? '' : eval(code);
			});
		}

		// Set initial value.
		(function() {
			el.innerHTML = eval(code);
		}).bind(this)();
	},

	text: function (self, code, el) {
		for (let path of parseVars(code)) {
			watch(self, path, (action, actionPath, value) => {
				el.textContent = traversePath(self, path) === undefined ? '' : eval(code);
			});
		}

		// Set initial value.
		(function() {
			el.textContent = eval(code);
		}).bind(this)();
	},

	loop: function (self, code, el) {
		if (el.shadowRoot)
			el = el.shadowRoot;


		// Parse code into foreach parts.
		var loopVar;
		[code, loopVar] = parseLoop(code);

		// The code we'll loop over.
		var html = el.innerHTML.trim();
		while (el.lastChild)
			el.removeChild(el.lastChild);


		var rebuildChildren = (function (action, path, value) {

			// Remove all children.
			// TODO: Use rebuildChildren args to only modify children that have changed.
			// I should also detect when an item is removed from the middle, by checking if the value is the next value in the lst.
			// Then I can simply remove one child and keep unbound textboxes from losing their values when they're destroyed/created.
			// Otherwise iterating and adding one item at a time will keep clearing and
			// resetting thie children at each iteration!
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
		}).bind(self);

		// Set initial children
		rebuildChildren.call(self);

		// Rebuild children when watched item changes.
		for (let path of parseVars(code)) {
			watch(self, path, rebuildChildren);
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
	attr: function (self, code, el, attr) {

		// If the variables in code, change, execute the code.
		// Then set the attribute to the value returned by the code.
		for (let path of parseVars(code)) {
			watch(self, path, (action) => { // slice() to remove this.
				if (traversePath(self, path) === undefined)
					el.removeAttribute(attr);
				else {
					var result = eval(code);
					if (result === false)
						el.removeAttribute(attr);
					else
						el.setAttribute(attr, result + '');
				}
			});

			// Set initial value.
			(function() {
				if (traversePath(self, path) === undefined)
					el.removeAttribute(attr);
				else {
					var result = eval(code);
					if (result === false)
						el.removeAttribute(attr);
					else
						el.setAttribute(attr, result + '');
				}
			}).bind(this)();

		}
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