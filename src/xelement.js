/*
Inherit from XElement to create custom HTML Components.

TODO: next goals:
indexOf and includes() on arrays fail because they compare proxied objects.
allow sortable?
rename data-bind to data-prop
Make data- prefix optional.  Use "x-", ":", or no prefix?
{{var}} in text and attributes
Fix failing Edge tests.
allow comments in loops.
x-elements in loops get fully initialized then replaced.




warning on data-prop wrong order.
TODO
Make shadowdom optional.

implement other binding functions.
allow loop over slots if data-loop is on the instantiation.
allow loop over more than one html tag.
cache results of parseVars() and other parse functions?
functions to enable/disable updates.
function to trigger updates?  Or a callback to apply all updates before DOM is updated.

create from <template> tag
When a change occurs, create a Set of functions to call, then later call them all.
	That way we remove some duplicate updates.
Auto bind to this in complex expressions if the class property already exists and the var is otherwise undefined?
improve minifcation.
Expose bindings prop in minified version.
non-ascii variable names.
throttle, debounce? data-val only trigger on change.  Via :attributes?
Auto two-way bind for simple variables?
bind to <input type="file">
bind to clipboard events
Named slot support? - https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_templates_and_slots
Separate out a lite version that doesn't do binding?
	This would also make the code easier to follow.  But what to call it?  XEl ? XElementLite?
TODO:
warning on loop element id.
warning if binding to id attribute assigned to element.


Disadvantages of Vue.js
10x larger.
Requires a single, special root component everything else must be within.
Doesn't use es6 classes.
Requires data and methods, can't bind directly to class props.
Doesn't support ShadowDOM, only emulates nested styles.
Requires key="" attributes everywhere to make identical elements unique.
Vue.js doesn't watch array indices or object property add/remove!
   Every time you assign have to call Vue.set(array...)
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
Checkboxes and <select multiple> to array of names.
lazy modifier for input binding, to only trigger update after change.

*/




/**
 * A map between elements and the callback functions subscribed to them.
 * Each value is an array of objects with path and callback function.
 * @type {WeakMap<HTMLElement, {path_:string, callback_:function}[]>} */
var elWatches = new WeakMap();
var addElWatch = (el, path, callback) => {
	let we = elWatches.get(el);
	if (!we)
		elWatches.set(el, we = []);
	we.push({path_: path, callback_: callback});
};


/**
 * A map between elements and the events assigned to them. *
 * @type {WeakMap<HTMLElement, *[]>} */
var elEvents = new WeakMap();

/**
 *
 * @param el {HTMLElement}
 * @param eventName {string}
 * @param callback {function}
 * @param originalEventAttrib {string} */
var addElEvent = (el, eventName, callback, originalEventAttrib, root) => {
	let ee = elEvents.get(el);
	if (!ee)
		elEvents.set(el, ee = []);
	ee.push([eventName, callback, originalEventAttrib, root]);
};


/**
 * @param cls {Function}
 * @returns {string} */
var getXName = (cls) => {
	if (!cls.xname_) {
		let lname =  'x-' + cls.name.toLowerCase().replace(/^x/, '');
		cls.xname_ = lname;

		// If name exists, add an incrementing integer to the end.
		// TODO: Should I throw an error instead?
		for (let i = 2; customElements.get(cls.xname_); i++)
			cls.xname_ = 'x-' + lname + i;
	}
	return cls.xname_;
};

/**
 * Get the nearest XElement parent.
 * @param el {HTMLElement}
 * @returns {XElement} */
var getXParent = (el) => { // will error if not in an XParent.
	while ((el = el.parentNode) && el && el.nodeType !== 11) {} // 11 is doc fragment
	return el ? el.host : null;
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

	bindElProps(self, el, context);
	bindElEvents(self, el, context, true);

	// TODO: assert() to make sure element isn't bound twice.
};


var bindElProps = (self, el, context) => {

	// Seach attributes for data- bindings.
	if (el.attributes) // shadow root has no attributes.
		for (let attr of el.attributes) {
			if (attr.name.startsWith('data-')) {

				let attrName = attr.name.slice(5); // remove data- prefix.

				if (bindings[attrName]) // attr.value is code.
					bindings[attrName](self, attr.value, el, context);

				//#IFDEV
				else
					throw new Error (attrName);
				//#ENDIF
			}
		}

	// Allow traversing from host element into its own shadowRoot
	// But not into the shadow root of other elements.
	let next = el===self && el.shadowRoot ? el.shadowRoot : el;

	// Data loop already binds its own children when first applied.
	if (!el.hasAttribute('data-loop'))
		for (let child of next.children)
			bindElProps(self, child, context);
};




/**
 * We rebind event attributes because otherwise there's no way
 * to make them call the class methods.
 * @param self {XElement}
 * @param el {HTMLElement}
 * @param context {object<string, string>=}
 * @param recurse {boolean=false}
 * @param getAttributesFrom {HTMLElement=} */
var bindElEvents = (self, el, context, recurse, getAttributesFrom) => {

	if (el.getAttribute) { // if not document fragment
		getAttributesFrom = getAttributesFrom || el;

		for (let eventName of eventNames) {
			let originalEventAttrib = getAttributesFrom.getAttribute('on' + eventName);
			if (originalEventAttrib) {

				let code = replaceVars(originalEventAttrib, context);

				// If it's a simple function that exists in the class,
				// add the "this" prefix.
				let path = parseVars(code, 0, 1)[0];
				if (path && traversePath(self, path) instanceof Function)
					code = addThis(code, context, isStandaloneCall);

				// The code in the attribute can reference:
				// 1. event, assigned to the current event.
				// 2. this, assigned to the class instance.
				let callback = function (event) {
					eval(code);
				}.bind(self);
				el.addEventListener(eventName, callback);
				addElEvent(el, eventName, callback, originalEventAttrib, self);

				// Remove the original version so it doesn't also fire.
				el.removeAttribute('on' + eventName);
			}
		}
	}

	if (recurse) {
		let next = el === self && el.shadowRoot ? el.shadowRoot : el;

		// data-loop handles its own children.
		if (!next.getAttribute || !next.hasAttribute('data-loop'))
			for (let child of next.children)
				bindElEvents(self, child, context, true);
	}
};




/**
 * Unbind properties and events from the element.
 * @param self {XElement|HTMLElement}
 * @param el {HTMLElement=} Remove all bindings within root and children. Defaults to self. */
var unbindEl = (self, el) => {
	el = el || self;

	// Only go into shadowroot if coming from the top level.
	// This way we don't traverse into the shadowroots of other XElements.
	var next = self===el && el.shadowRoot ? el.shadowRoot : el;

	// Recursively unbind children.
	for (let child of next.children)
		unbindEl(self, child);

	// Unbind properties
	if (el.attributes)
		for (let attr of el.attributes) {
			if (attr.name.startsWith('data-')) {

				if (attr.name === 'data-loop' && el.loopHtml_) {
					el.innerHTML = el.loopHtml_; // revert it back to the look template element.
					delete el.loopHtml_;
					delete el.items_;
				}

				let watchedEl = elWatches.get(el);
				if (watchedEl)
					for (let sub of watchedEl) {
						var p = p || getXParent(el) || self; // only getXParent when first needed.
						unwatch(p, sub.path_, sub.callback_);
					}
			}
		}

	// Unbind events
	let ee = elEvents.get(el) || [];
	for (let item of ee) { //  item is [event:string, callback:function, originalCode:string, root:XElement]

		// Only unbind if it was bound from the same root.
		// This is needed to allow onclick="" attributes on both the definition and instantiation of an element,
		// and having their "this" bound to themselves or the parent element, respectively.
		if (item[3] === self) {
			el.removeEventListener(item[0], item[1]);
			el.setAttribute('on' + item[0], item[2]);
		}
	}
};


var setAttribute = (self, name, value) => {

	// Copy to class properties.
	// This doesn't work because the properties aren't created until after initHtml() is called.
	if (!isValidAttribute(self, name)) {

		// As javascript code to be evaluated.
		// TODO: Should this feature be deprecated or moved to data-properties  Overlap with data-prop?
		if (value && value.length > 2 && value.startsWith('{') && value.endsWith('}')) {
			(function(){ // Guard scope before calling eval.
				value = eval(value.slice(1, -1)); // code to eval
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
	if (!self.init_) {

		self.init_ = 1;

		// 1. Create temporary element.
		var div = createEl(self.constructor.html_.trim()); // html_ is set from ClassName.html = '...'

		// 2. Remove and save attributes from instantiation.
		var attributes = {};
		for (let attr of self.attributes) // From instantiation.
			attributes[attr.name] = attr.value;

		// 3.  Add attributes from definition (Item.html='<div attr="value"')
		for (let attr of div.attributes) { // From definition
			if (attr.name)
				setAttribute(self, attr.name, attr.value);
		}

		// 4. Bind events on the defintion to functions on its own element and not its container
		bindElEvents(self, self, null, false, div);

		// 5.  Add attributes from instantiation.
		for (let name in attributes) // From instantiation
			setAttribute(self, name, attributes[name]);

		// 6. Create Shadow DOM
		self.attachShadow({mode: 'open'});
		while (div.firstChild)
			self.shadowRoot.insertBefore(div.firstChild, null);
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
		for (let node of root.querySelectorAll('[id]')) {
			let id = node.getAttribute('id');
			Object.defineProperty(self, id, {
				// Make it readonly.
				// Using writeable: false caused errors if the getter returns a proxy instead of the proper type.
				// But how does it know it's the wrong type?

				enumerable: 1,
				configurable: 1,
				get: () => node,
				set: () => {
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
		// TODO: Move bind into setAttribute above, so we can call it separately for definition and instantiation?
		bindElProps(self, self);


		// We pass root to bind all events on this element's children.
		// We bound events on the element itself in a separate call to bindElEvents(self, self) above.
		bindElEvents(self, root, null, true);
	}
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
				watch(self, path, setAttr);
				addElWatch(el, path, setAttr);
			}

			setAttr();
		}
	},


	/**
	 * @param self {XElement}
	 * @param code {string}
	 * @param el {HTMLElement}
	 * @param context {object<string, string>} */
	prop: (self, code, el, context) => {
		// allow binding only on XElement
		if (self !== el && el instanceof XElement) {

			var obj = parseObj(code);
			for (let prop in obj) {

				let expr = addThis(replaceVars(obj[prop], context), context);
				let updateProp = (action, path, value) => {
					el[prop] = safeEval.call(self, expr);
				};

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
									callback.apply(el, arguments);
								});
							}
						}
					}
				}

				// Add a regular watch.
				else
					for (let path of parseVars(expr))
						watch(self, path, updateProp);
			}
		}
	},

	/**
	 * @param self {XElement}
	 * @param code {string}
	 * @param el {HTMLElement}
	 * @param context {object<string, string>} */
	classes: (self, code, el, context) => {

		var obj = parseObj(code);
		for (let name in obj) {
			let classExpr = addThis(replaceVars(obj[name], context), context);

			// This code is called on every update.
			let updateClass = () => {
				let result = safeEval.call(self, classExpr);
				if (result)
					el.classList.add(name);
				else {
					el.classList.remove(name);
					if (!el.classList.length) // remove attribute after last class removed.
						el.removeAttribute('class');
				}
			};


			// Create properties and watch for changes.
			for (let path of parseVars(classExpr)) {
				//traversePath(self, path, true); // Create properties.
				watch(self, path, updateClass);
			}

			// Set initial values.
			updateClass();
		}
	},

	/**
	 * @param self {XElement}
	 * @param code {string}
	 * @param el {HTMLElement}
	 * @param context {object<string, string>} */
	text: (self, code, el, context) => {
		code = addThis(replaceVars(code, context), context);
		let setText = (/*action, path, value*/) => {
			el.textContent = safeEval.call(self, code);
		};
		for (let path of parseVars(code)) {
			watch(self, path, setText);
			addElWatch(el, path, setText);
		}

		// Set initial value.
		setText();
	},

	/**
	 * @param self {XElement}
	 * @param code {string}
	 * @param el {HTMLElement}
	 * @param context {object<string, string>} */
	html: (self, code, el, context) => {
		code = addThis(replaceVars(code, context), context);
		let setHtml = (/*action, path, value*/) => {
			el.innerHTML = safeEval.call(self, code);
		};

		for (let path of parseVars(code)) {
			watch(self, path, setHtml);
			addElWatch(el, path, setHtml);
		}

		// Set initial value.
		setHtml();
	},


	// TODO: Removing an item from the beginning of the array copy the first to the 0th,
	// then createEl a new 1st item before deleting it when rebuildChildren is called again with the delete operation.
	// Batching updates into a set should fix this.
	/**
	 * @param self {XElement}
	 * @param code {string}
	 * @param el {HTMLElement}
	 * @param context {object<string, string>} */
	loop: (self, code, el, context) => {

		context = {...context}; // copy, because we add to it as we descend.

		// Parse code into foreach parts
		var [foreach, loopVar, indexVar] = parseLoop(code);
		foreach = replaceVars(foreach, context);
		foreach = addThis(foreach, context);

		// Allow loop attrib to be applied above shadowroot.
		el = el.shadowRoot || el;

		var rebuildChildren = (action, path, value) => {

			// If we splice off the first item from an array, rebuildChildren() is called every time
			// element n+1 is assigned to slot n.  splice() then sets the array's .length property at the last step.
			// So we only rebuild the children after this happens.
			if (ArrayMultiOps.includes(ProxyObject.currentOp)) {
				ProxyObject.whenOpFinished = rebuildChildren;
				return;
			}



			if (window.debugger) {
				console.log(ProxyObject.currentOp, action, path, value);
			}

		
			// The code we'll loop over.
			// We store it here because innerHTML is lost if we unbind and rebind.
			if (!el.loopHtml_) {
				el.loopHtml_ = el.innerHTML.trim();

				// Remove children before calling rebuildChildren()
				// That way we don't unbind elements that were never bound.
				while (el.lastChild)
					el.removeChild(el.lastChild);
			}

			//#IFDEV
			if (!el.loopHtml_)
				throw new XElementError('Loop "' + code + '" rebuildChildren() called before bindEl().');
			//#ENDIF

			var newItems = removeProxies(safeEval.call(self, foreach) || []);
			var oldItems = removeProxies(el.items_ || []);

			if (arrayEq(oldItems, newItems))
				return;

			// Set temporary index on each child, so we can track how they're re-ordered.
			for (let i in Array.from(el.children))
				el.children[i].index_ = i;

			// Create a map from the old items to the elements that represent them.
			var oldMap = new Map();
			var newSet = new Set(newItems);
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
				let oldChild = el.children[i];
				let newChild = (oldMap.get(newItems[i]) || []).pop(); // last on, first off b/c above we iterate in reverse.
				let isNew = !newChild;

				// If the existing child doesn't match the new item.
				if (!oldChild || oldChild !== newChild) {

					// Create a new one if needed.
					// TODO: createEl() binds nexted x-elements before we're ready for them to be bound.
					// E.g. below we set the localContext for loop variables.
					if (isNew)
						newChild = createEl(el.loopHtml_);

					// This can either insert the new one or move an old one to this position.
					el.insertBefore(newChild, oldChild);
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

			let localContext = {...context};
			//#IFDEV
			if (loopVar in localContext)
				throw new XElementError('Loop variable "' + loopVar + '" already used in outer loop.');
			if (indexVar && indexVar in localContext)
				throw new XElementError('Loop index variable "' + indexVar + '" already used in outer loop.');
			//#ENDIF

			// Rebind events on any elements that had their index change.
			for (let i in Array.from(el.children)) {
				let child = el.children[i];
				if (child.index_ !== i) {

					unbindEl(self, child);

					localContext[loopVar] = foreach + '[' + i + ']';
					if (indexVar !== undefined)
						localContext[indexVar] = i;

					bindEl(self, child, localContext);

					
					// Alt version that makes some things fail:
					// Operates within the child.
					//bindEl(child, child, localContext);
					// Operates on the child's attributes within self.  E.g. data-prop
					//bindEl(self, child, localContext);
				}
				delete child.index_;
			}


			el.items_ = newItems.slice(); // copy
		};



		for (let path of parseVars(foreach)) {
			watch(self, path, rebuildChildren);
			addElWatch(el, path, rebuildChildren);
		}

		// Set initial children
		rebuildChildren();
	},


	/**
	 * Special 2-way binding
	 * @param self {XElement}
	 * @param code {string}
	 * @param el {HTMLElement}
	 * @param context {object<string, string>} */
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

		let setVal = (/*action, path, value*/) => {
			let result = safeEval.call(self, code);

			if (el.type === 'checkbox')
				// noinspection EqualityComparisonWithCoercionJS
				el.checked = result == true;
			else
				el.value = result;
		};

		// Update input value when object property changes.
		for (let path of paths) {
			watch(self, path, setVal);
			addElWatch(el, path, setVal);
		}

		// Set initial value.
		setVal();
	},

	/**
	 * @param self {XElement}
	 * @param code {string}
	 * @param el {HTMLElement}
	 * @param context {object<string, string>} */
	visible: (self, code, el, context) => {
		code = addThis(replaceVars(code, context), context);
		var displayNormal = el.style.display;
		if (displayNormal === 'none')
			displayNormal = '';

		let setVisible = (/*action, path, value*/) => {
			el.style.display = safeEval.call(self, code) ? displayNormal : 'none';
		};

		for (let path of parseVars(code)) {
			watch(self, path, setVisible);
			addElWatch(el, path, setVisible);
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
 * Override the static html property so we can call customElements.define() whenever the html is set.*/
Object.defineProperty(XElement, 'html', {
	get: () => this.html_,
	set: function (html) {

		// TODO: We want to be able to do:
		// <x-item arg1="1", arg2="2">
		// And have those passed to Item's constructor.
		// Here we can get the names of those arguments, but how to intercept the browser's call to the constructor?
		// Below I tried to work around this by subclassing.
		// But we can't get a reference to the <x-item> to read its attributes before the super() call.
		// const self = this;
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

		// New way where we pass attributes to the constructor:
		// customElements.define(name, Embedded);
		// customElements.define(name+'-internal', this);

		// Old way:
		customElements.define(getXName(this), this);

		return this.html_ = html;
	}
});

// Exports
XElement.bindings = bindings;
window.XElement = XElement;