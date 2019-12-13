/*
Inherit from XElement to create custom HTML Components.


TODO
Make data- prefix optional.
Fix failing Edge tests.
Separate "this" binding for data attr on definition vs instantiation
Make shadowdom optional.
indexOf and includes() on arrays fail because they compare proxied objects.

allow sortable?
implement other binding functions.
allow loop over slots if data-loop is on the instantiation.
allow loop over more than one html tag.
cache results of parseVars() and other parse functions?
cache the context of loop vars.
functions to enable/disable updates.
function to trigger updates?  Or a callback to apply all updates before DOM is updated.

create from <template> tag
When a change occurs, create a Set of functions to call, then later call them all.
	That way we remove some duplicate updates.
Auto bind to this in complex expressions if the class property already exists and the var is otherwise undefined?
improve minifcation.
Expose bindings prop in minified version.
non-ascii variable names.
throttle, debounce? data-val only trigger on change.
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
No id's to class properties.

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
 * This will return an incorrect result if called on a nested loop element.
 * Because the outer loop must be processed and build before we know the index for the inner element.
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
		if (parent.bindings)
			break;
	}
	return context;
};


/**
 * Recursively process all the data- attributes in el and its descendants.
 * @param self {XElement}
 * @param el {HTMLElement}
 * @param context {object<string, string>=} A map of loop variable names to their absolute reference.
 * This allows us to do variable replacement:
 *     <div>data-loop="this.items : item">
 *         <div data-val="item.name">
 *  The looped item becomes:
 *         <div data-val="this.items[0].name"> */
var bindEl = (self, el, context) => {
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
				if (attrName === 'loop') { // only the foreach part of a data-loop="..."

					// Replace vars only in the part of the foreach loop before the ":"
					// This is necessary for inner nested loops.
					[foreach, item, indexVar] = parseLoop(code);
					foreach = replaceVars(foreach, context);
					foreach = addThis(foreach, context);
				}

				if (bindings[attrName])
					bindings[attrName](self, code, el, context);

				//#IFDEV
				else
					throw new Error (attrName);
				//#ENDIF
			}
		}

	// Allow traversing from host element into its own shadowRoot
	// But not into the shadow root of other elements.
	let root = el;
	if (el===self && el.shadowRoot)
		root = el.shadowRoot;

	for (let i=0; i < root.children.length; i++) {

		// Add to context as we descend.
		// This seems only needed to soupport nested loops?
		if (foreach) {
			context[item] = foreach + '[' + i + ']';
			if (indexVar !== undefined)
				context[indexVar] = i;
		}

		bindEl(self, root.children[i], context);
	}

	// Remove the loop context after we traverse outside of it.
	if (item)
		delete context[item];
};



/**
 * @param root {HTMLElement} Remove all bindings within root and children.*/
var unbindEl = (root) => {

	var els = [...root.querySelectorAll('*')];
	if (root.attributes)
		els.unshift(root);

	for (let el of els) {

		for (let attr of el.attributes) {
			if (attr.name.slice(0, 5) === 'data-') {
				let callbacks = watchedEls.get(el) || [];
				if (callbacks.length) {
					let code = attr.value;
					var context = context || getContext(el);

					if (attr.name === 'data-loop') // get vars from only the foreach part of a data-loop="..."
						code = parseLoop(code)[0];

					code = replaceVars(code, context);
					let paths = parseVars(code); // TODO this will not property parse classes, attribs, and data-bind.

					for (let path of paths)
						// watchedEls.get() returns callbacks from all paths, but unwatch only unsubscribes those of path.
						for (let callback of callbacks || []) {
							var self = self || getXParent(root);
							unwatch(self, path, callback);
						}
				}
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
		bindElEvents(self, el);
	}
};

var bindElEvents = (self, el, getAttributesFrom) => {
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

	// 4. Bind events on the defintion to functions on its own element and not its container.
	bindElEvents(self, self, div);

	// 5.  Add attributes from instantiation.
	for (let name in attributes) // From instantiation
		setAttribute(self, name, attributes[name]);

	// 6. Create Shadow DOM
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



	// 7. Create class properties that reference any html element with an id tag.
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




	// 8. Bind all data- and event attributes
	// TODO: Move bind into setAttribute above, so we can call it separately for definition and instantiation.
	bindEl(self, self);
	bindEvents(self, root);

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
var bindings = {

	/**
	 * When self.field changes, update the value of <el attr>.
	 * This binding is used if one of the other names above isn't matched.
	 * @param self {XElement}
	 * @param code {string}
	 * @param el {HTMLElement}
	 * @param context {object<string, string>} */
	attribs: (self, code, el, context) => {
		var obj = parseObj(code);
		for (let name in obj) {
			let attrExpr = addThis(replaceVars(obj[name], context), context);

			let setAttr = function (/*action, path, value*/) {
				var result = safeEval.call(self, attrExpr);
				if (result === false || result === null || result === undefined)
					el.removeAttribute(name);
				else
					el.setAttribute(name, result + '');

			}.bind(self);

			// If the variables in code, change, execute the code.
			// Then set the attribute to the value returned by the code.
			for (let path of parseVars(attrExpr)) {
				watchXElement(self, path, setAttr);
				addWatchedEl(el, setAttr);
			}

			setAttr();
		}
	},


	bind: (self, code, el, context) => {
		if (!(self !== el && el instanceof XElement))
			return;


		// Temporary.  Put this in its own function or something.
		var obj = parseObj(code);

		for (let prop in obj) {

			// Assign the referenced object to a variable on el.
			let expr = addThis(replaceVars(obj[prop], context), context);

			let updateProp = function updateProp(action, path, value) {
				el[prop] = safeEval.call(self, expr);
			}.bind(self);


			// Set initial values.
			updateProp();

			// If binding to the parent, "this", we need to take extra steps,
			// because normally we can only bind to object properties and not the object itself.
			if (expr === 'this') {

				// 1. We get the subscriptions that watch the property on el.
				let subs = watched.get(el).subs_;

				for (let sub in subs) {
					if (sub.startsWith('"' + prop + '"')) {
						let subPath = JSON.parse('[' + sub + ']');

						// 2. For each function, we move the watch from the child object to the parent object.
						for (let callback of subs[sub]) {
							unwatch(el, subPath, callback);
							watch(self, subPath.slice(1), function (action, path, value) {
								// 3. And intercept its call to make sure we pass the original path.
								callback.call(el, action, subPath, value);
							});
						}
					}
				}
			}

			// Add a regular watch.
			else
				for (let path of parseVars(expr))
					watchXElement(self, path, updateProp);
		}

	},

	classes: (self, code, el, context) => {

		// Temporary.  Put this in its own function or something.
		var obj = parseObj(code);
		for (let name in obj) {
			let classExpr = addThis(replaceVars(obj[name], context), context);

			// This code is called on every update.
			let updateClass = function () {
				let result = safeEval.call(self, classExpr);
				if (result)
					el.classList.add(name);
				else {
					el.classList.remove(name);
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

	text: (self, code, el, context) => {
		code = addThis(replaceVars(code, context), context);
		let setText = function setText(action, path, value) {
			//debugger;
			el.textContent = safeEval.call(self, code);
		};
		for (let path of parseVars(code)) {
			watchXElement(self, path, setText);
			addWatchedEl(el, setText);
		}

		// Set initial value.
		setText();
	},

	html: (self, code, el, context) => {
		code = addThis(replaceVars(code, context), context);
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



	loop: (self, code, el, context) => {

		function rebuildChildren(action, path, value) {
			if (window.debug)
				debugger;

			var newItems = safeEval.call(self, foreach) || [];
			var oldItems = el.items || [];

			if (arrayEq(oldItems, newItems))
				return;

			var newSet = new Set(newItems);

			// Create a map from the old items to the elements that represent them.
			var oldMap = new Map();
			for (let i=oldItems.length-1; i>=0; i--) {
				let oldItem = oldItems[i];
				let child = el.children[i];

				// And remove any elements that are no longer present.
				if (!newSet.has(oldItem)) {
					unbindEl(child);
					el.removeChild(child);
				}

				// Create a list of items we want to keep, indexed by their value.
				// If there are duplicates, we add them to the array.
				// This prevents us from destroying and recreating the same elements,
				// Which is slower and makes form elements lose focus while typing.
				else if (oldMap.has(oldItem))
					oldMap.get(oldItem).push(child);
				else
					oldMap.set(oldItem, [child]);
			}

			// Loop through newItems, creating and moving children as needed.
			for (let i=0; i<newItems.length; i++) {
				let newItem = newItems[i];
				let oldChild = el.children[i];
				let newChild = (oldMap.get(newItem) || []).pop(); // last on, first off b/c above we iterate in reverse.
				let isNew = !newChild;

				// If the existing child doesn't match the new item.
				if (!oldChild || oldChild !== newChild) {

					// Create a new one if needed.
					if (isNew)
						newChild = createEl(el.loopHtml);

					// This can either insert the new one or move an old one to this position.
					el.insertBefore(newChild, oldChild);

					// Add binding for any new elements.
					if (isNew) {
						bindEl(self, newChild); // should I pass a clone of context?
						bindEvents(self, newChild);
					}
				}
			}

			// If there are identical items in the array, some extras can be left at the end.
			for (let i=oldItems.length-1; i>=newItems.length; i--) {
				let child = el.children[i];
				if (child) {
					unbindEl(child);
					el.removeChild(child);
				}
			}

			el.items = newItems.slice(); // copy
		}



		// Allow loop attrib to be applied above shadowroot.
		el = el.shadowRoot || el;

		// Parse code into foreach parts
		var [foreach] = parseLoop(code);
		foreach = replaceVars(foreach, context);
		foreach = addThis(foreach, context);

		// The code we'll loop over.
		// We store it here because innerHTML is lost if we unbind and rebind.
		if (!el.loopHtml)
			el.loopHtml = el.innerHTML.trim();

		// Remove children before calling rebuildChildren()
		// That way we don't unbind elements that were never bound.
		while (el.lastChild)
			el.removeChild(el.lastChild);

		for (let path of parseVars(foreach)) {
			watchXElement(self, path, rebuildChildren);
			addWatchedEl(el, rebuildChildren);
		}

		// Set initial children
		rebuildChildren.call(self);
	},

	// Special 2-way binding
	val: (self, code, el, context) => {
		code = addThis(replaceVars(code, context), context);

		// Update object property when input value changes, only if a simple var.
		var paths = parseVars(code);
		if (paths.length === 1 && isStandaloneVar(code))
			el.addEventListener('input', () => {
				let value;
				if (el.type === 'checkbox')
					value = el.checked;
				else
					value = el.value || el.innerHTML || ''; // works for input, select, textarea, [contenteditable]

				// We don't use watchlessSet in case other things are subscribed.
				traversePath(self, paths[0], true, value);
			});

		let setVal = function(action, path, value) {
			let result = safeEval.call(self, code);

			if (el.type === 'checkbox')
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

	visible: (self, code, el, context) => {
		code = addThis(replaceVars(code, context), context);
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
 * TODO: This function may be unnecessary.  I should try replacing it with watch().
 * Traverse starting from path and working upward,
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
XElement.bindings = bindings;
window.XElement = XElement;