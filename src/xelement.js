/*
Inherit from XElement to create custom HTML Components.


TODO: major bugfixes
Removing a node that contains an xelement doesn't remove its items from elWatches or elsewhere?
	How to unittest this, since I can't inspect what's in weakmap?
	This can be tested in the test app by opening multiple programs.
Write a better parser for expr.replace(/this/g, 'parent');
parseVars("this.passthrough(x)") doesn't find x.
parseVars("item + passthrough('')") finds "passthrough" as a variable.
Write a getWatches(el, expr) function that calls replaceVars, addThis, parseVars, an getRootXElement
	to give back
Document all properties that bindings.loop() sets on elements.
Won't bind to properties on the class itself, insead of those defined within constructor.  Because they are called after the super constructor!
Use a regex or parser to remove the html of x-loops before they're passed to createEl().  This can remove the check at the top of initHtml() and the .initialized property.
Make sure recursive embeds work if:  1. the x-loop is on the x-parent above the shadow dom.  2. An x-element is within a div inside the loop.

TODO: next goals:
{{var}} in text and attributes, and stylesheets?
Fix failing Edge tests.
allow comments in loops.
x-elements in loops get fully initialized then replaced.  Is this still true?




Finish making shadowdom optional.

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
Expose bindings prop in minified version to allow plugins.
non-ascii variable names.
throttle, debounce? data-val only trigger on change.  E.g. x-val:debounce(100)=""  x-visible:fade(100)=""
Auto two-way bind for simple variables?
bind to <input type="file">
bind to clipboard events
Named slot support? - https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_templates_and_slots
Separate out a lite version that doesn't do binding?
	This would also make the code easier to follow.  But what to call it?  XEl ? XElementLite?
allow ${text} variables in nested styles?
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
 * @type {WeakMultiMap<HTMLElement, {path_:string, callback_:function}[]>} */
var elWatches = new WeakMultiMap();


/**
 * A map between elements and the events assigned to them. *
 * @type {WeakMultiMap<HTMLElement, *[]>} */
var elEvents = new WeakMultiMap();



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
 * Follow the path to get the root XElement, returning it and the remaining path.
 * This is useful for watch()'ing the right elements with data-prop is used.
 * @param obj {object}
 * @param path {string[]}
 * @return {[XElement, string[]]} */
var getRootXElement = function(obj, path) {
	path = path.slice();
	let result = [obj, path.slice()];

	// Follow the path upward, assigning to obj at each step.
	while (obj = obj[path.shift()])
		if (obj instanceof XElement)
			result = [obj, path.slice()]; // .slice() to copy the path so that shift() doesn't modify our result.

	return result;
};

var getLoopCode_ = (el) => el.getAttribute && (el.getAttribute('x-loop') || el.getAttribute('data-loop'));

var getXAttrib = (el, name) => el.getAttribute && (el.getAttribute('x-' + name) || el.getAttribute('data-' + name));

var parseXAttrib = (name) => name.startsWith('x-') ? name.slice(2) : name.startsWith('data-') ? name.slice(5) : null;


var parseXAttrib2 = (name) => {
	var parts = name.split(/:/g);
	var functions = {};
	for (let i=1; i<parts.length; i++) {
		let [name, code] = parts[i].split('(');
		functions[name] = code.slice(0, -1); // remove trailing )
	}
	return [parts[0], functions];
};

/**
 * Recursively process all the data- attributes in el and its descendants.
 * @param self {XElement}
 * @param el {HTMLElement}
 * @param context {object<string, string>[]=} A map of loop variable names to their absolute reference.
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


var bindElProps = (xelement, el, context) => {
	context = context || [];
	context = context.slice();


	// Handle data-prop and
	if (el instanceof XElement) {

		// Bind instantiation attributes (to the parent, not ourselves)
		if (el !== xelement)
			for (let attrName in el.instantiationAttributes) {
				let val = el.instantiationAttributes[attrName];
				let name = parseXAttrib(attrName);
				if (name && name !== 'prop') { // prop handled in init so it happens first.
					if (bindings[name]) // attr.value is code.
						bindings[name](xelement, val, el, context);

					//#IFDEV
					else
						throw new XElementError(attrName);
					//#ENDIF
				}
			}


		// Don't inherit within-element context from parent.
		el.propContext = (xelement.propContext || []).slice();

		let prop = getXAttrib(el, 'prop');
		if (prop) {

			// Here we still need to use the inner context of the parent XElement because
			// prop may have variables within it that may need to be resolved.
			bindings.prop(xelement, prop, el, context); // adds a new context to the beginning of the array.

			// Then we add the new context item added by prop();
			context = [context[0], ...el.propContext];
		}
		else
			context = el.propContext.slice();



		for (let attrName in el.definitionAttributes) {
			let val = el.definitionAttributes[attrName];
			let name = parseXAttrib(attrName);
			if (name && name !== 'prop') { // prop handled in init so it happens first.
				if (bindings[name]) // attr.value is code.
					bindings[name](el, val, el, context);

				//#IFDEV
				else
					throw new XElementError(attrName);
				//#ENDIF
			}
		}


		xelement = el;
	}


	// Seach attributes for data- bindings.
	else if (el.attributes) { // shadow root has no attributes.
		for (let attr of el.attributes) {
			let attrName = parseXAttrib(attr.name);
			if (attrName && attrName !== 'prop') { // prop handled in init so it happens first.
				if (bindings[attrName]) // attr.value is code.
					bindings[attrName](xelement, attr.value, el, context);

				//#IFDEV
				else
					throw new XElementError(attrName);
				//#ENDIF
			}
		}
	}





	// Data loop already binds its own children when first applied.
	// So we don't iterate into those children.
	if (!getLoopCode_(el)) {

		// Allow traversing from host element into its own shadowRoot
		let next = el.shadowRoot || el;

		for (let child of next.children)
			bindElProps(xelement, child, context);
	}
};



/**
 * We rebind event attributes because otherwise there's no way
 * to make them call the class methods.
 * @param xelement {XElement}
 * @param el {HTMLElement}
 * @param context {object<string, string>=}
 * @param recurse {boolean=false}
 * @param getAttributesFrom {HTMLElement=} */
var bindElEvents = (xelement, el, context, recurse, getAttributesFrom) => {

	if (el.getAttribute) { // if not document fragment
		getAttributesFrom = getAttributesFrom || el;

		for (let eventName of eventNames) {
			let originalEventAttrib = getAttributesFrom.getAttribute('on' + eventName);
			if (originalEventAttrib) {

				let code = replaceVars(originalEventAttrib, context);

				// If it's a simple function that exists in the class,
				// add the "this" prefix.
				let path = parseVars(code, 0, 1)[0];
				if (path && traversePath(xelement, path) instanceof Function)
					code = addThis(code, context, isStandaloneCall);

				// The code in the attribute can reference:
				// 1. event, assigned to the current event.
				// 2. this, assigned to the class instance.
				let callback = function (event) {

					eval(code);

					// TODO: Make safeEval() work here.  It currently fails bc it has the wrong xelement.
					// Try this again after we redo event binding in initHtml().
					//safeEval.call(xelement, code, {event: event}, true);
				}.bind(xelement);

				el.addEventListener(eventName, callback);

				// Save everything we'll need to restore it later.
				elEvents.add(el, [eventName, callback, originalEventAttrib, xelement]);
				//addElEvent(el, eventName, callback, originalEventAttrib, xelement);

				// Remove the original version so it doesn't also fire.
				el.removeAttribute('on' + eventName);
			}
		}
	}

	if (recurse) {
		// Allow traversing from host element into its own shadowRoot
		let next = el.shadowRoot || el;
		if (el instanceof XElement)
			xelement = el;

		// data-loop handles its own children.
		if (!getLoopCode_(next))
			for (let child of next.children)
				bindElEvents(xelement, child, context, true);
	}
};




/**
 * Unbind properties and events from the element.
 * @param xelement {XElement|HTMLElement}
 * @param el {HTMLElement=} Remove all bindings within root and children. Defaults to self. */
var unbindEl = (xelement, el) => {
	el = el || xelement;

	var next = el.shadowRoot || el;

	// Recursively unbind children.
	for (let child of next.children) {

		// Change xelement reference as we descend into other xelements.
		// This is needed for test prop.unbindChild()
		if (child instanceof XElement)
			unbindEl(child, child);
		else
			unbindEl(xelement, child);
	}

	// Unbind properties
	if (el.attributes)
		for (let attr of el.attributes) {
			if (attr.name.startsWith('x-') || attr.name.startsWith('data-')) {

				if ((attr.name === 'x-loop' || attr.name === 'data-loop') && el.loopHtml_) {
					el.innerHTML = el.loopHtml_; // revert it back to the look template element.
					delete el.loopHtml_;
					delete el.items_;
					delete el.context_;
					delete el.propContext;
				}

				// New
				let watches = elWatches.getAll(el);
				for (let w of watches)
					unwatch(...w);
				elWatches.removeAll(el);
			}
		}

	// Unbind events
	let ee = elEvents.getAll(el) || [];
	for (let item of ee) { //  item is [event:string, callback:function, originalCode:string, root:XElement]

		// Only unbind if it was bound from the same root.
		// This is needed to allow onclick="" attributes on both the definition and instantiation of an element,
		// and having their "this" bound to themselves or the parent element, respectively.
		if (item[3] === xelement) {
			el.removeEventListener(item[0], item[1]);
			if (item[2])
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
			self[name] = safeEval.call(self, value.slice(1, -1)); // code to eval
		}
		else
			self[name] = value;
	}

	// Copy attribute as an attribute.
	else
		self.setAttribute(name, value);
};


let disableBind = 0;

var initHtml = (self) => {

	if (!self.init_) {

		self.init_ = 1;

		//#IFDEV
		if (!self.constructor.html_)
			throw new XElementError('XElement .html property must be set to a non-empty string.');
		//#ENDIF

		// If a child of a loop, before loop is initialized.
		if (self.parentNode && getXAttrib(self.parentNode, 'loop')) {
			self.parentNode.loopHtml = self.constructor.html_.trim();
			return false;
		}

		// 1. Create temporary element.
		disableBind++;
		var div = createEl(self.constructor.html_.trim()); // html_ is set from ClassName.html = '...'
		disableBind--;


		// Save definition attributes
		for (let attr of div.attributes)
			self.definitionAttributes[attr.name] = attr.value;

		// 2. Remove and save attributes from instantiation.
		for (let attr of self.attributes) // From instantiation.
			self.instantiationAttributes[attr.name] = attr.value;

		// 3.  Add attributes from definition (Item.html='<div attr="value"')
		for (let attr of div.attributes) { // From definition
			if (attr.name)
				setAttribute(self, attr.name, attr.value);
		}

		// 4. Bind events on the defintion to functions on its own element and not its container
		// TODO: Remove this line and make the bindElEvents() smart enough to know what to do on its own, like we did with bindElProps()
		bindElEvents(self, self, null, false, div);

		// 5.  Add attributes from instantiation.
		for (let name in self.instantiationAttributes) // From instantiation
			setAttribute(self, name, self.instantiationAttributes[name]);

		// 6. Create children

		// As Shadow DOM
		let mode = self.constructor.shadowMode;
		if (!mode)
			mode = 'open';

		if (mode === 'open' || mode === 'closed') {
			self.attachShadow({mode: mode});
			while (div.firstChild)
				self.shadowRoot.insertBefore(div.firstChild, null);

		}
		else { // mode == 'none'

			// without
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
		}

		var root = self.shadowRoot || self;

		// 7. replace link tags with inline styles, if the style has already been added to the outermost document.
		// This prevents making an http request for each one when the server doesn't have caching.  (e.g. during development)
		for (let link of root.querySelectorAll('link')) {
			for (let stylesheet of document.styleSheets)
				if (stylesheet.href === link.href) {
					link.parentNode.replaceChild(
						XElement.createEl(
							'<style>' +
							Array.from(stylesheet.cssRules).map(x => x.cssText).join('\n') +
							'</style>'),
						link);
					break;
				}
		}


		// 8. Create class properties that reference any html element with an id tag.
		for (let node of root.querySelectorAll('[id]')) {
			let id = node.getAttribute('id');

			//#IFDEV
			// Make sure we're not replacing an existing method.
			if (id in self && self[id] instanceof Function)
				throw new XElementError('Cannot set property "' + id + '" on "' + self.constructor.name +
					'" because there is already a class method with the same name.');
			//#ENDIF

			Object.defineProperty(self, id, {
				// Make it readonly.
				// Using writeable: false caused errors if the getter returns a proxy instead of the proper type.
				// But how does it know it's the wrong type?

				enumerable: 1,
				configurable: 1,
				get: () => node,
				//#IFDEV
				set: () => {
					throw new XElementError('Property ' + id + ' not writable');
				}
				//#ENDIF
			});

			// Only leave the id attributes if we have a shadow root.
			// Otherwise we'll have duplicate id's in the main document.
			if (!self.shadowRoot)
				node.removeAttribute('id');
		}


		if (disableBind === 0) {

			// 9. Bind all data- and event attributes
			// TODO: Move bind into setAttribute above, so we can call it separately for definition and instantiation?
			bindElProps(self, self);


			// We pass root to bind all events on this element's children.
			// We bound events on the element itself in a separate call to bindElEvents(self, self) above.
			bindElEvents(self, root, null, true);
		}

		self.initialized = true;
	}
};

/**
 * @extends HTMLElement
 * @extends Node
 * @property {HTMLElement} shadowRoot
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

		// Class properties
		this.parent = undefined;
		this.definitionAttributes = {};
		this.instantiationAttributes = {};


		let xname = getXName(this.constructor);
		let self = this;
		if (customElements.get(xname))
			initHtml(self);
		else
			customElements.whenDefined(xname).then(() => {
				initHtml(self);
			});
	}

	/**
	 * TODO: Use this function in more places.
	 * @param expr {string}
	 * @param context {object[]}
	 * @returns {[XElement, string[]][]} Array of arrays, with each sub-array being a root and the path from it.  */
	getWatchedPaths(expr, context) {
		expr = addThis(replaceVars(expr, context), context);
		return parseVars(expr).map(
			(path)=>getRootXElement(this, path)
		);
	}
}



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

		return this.html_ = html.trim();
	}
});

// Exports
XElement.bindings = bindings;
XElement.createEl = createEl; // useful for other code.
XElement.getXParent = getXParent;
XElement.removeProxy = removeProxy;
window.XElement = XElement;

// Used as a passthrough for xelement attrib debugging.
window.xdebug = (a) => {
	debugger;
	return a;
};
window.xlog = (a) => {
	console.log(a);
	return a;
};