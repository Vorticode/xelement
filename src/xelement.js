/*
Inherit from XElement to create custom HTML Components.


TODO: major bugfixes
Write a better parser for expr.replace(/this/g, 'parent');
parseVars("this.passthrough(x)") doesn't find x.
parseVars("item + passthrough('')") finds "passthrough" as a variable.
Write a getWatches(el, expr) function that calls replaceVars, addThis, parseVars, an getRootXElement
	to give back
Document all properties that bindings.loop() sets on elements.
Won't bind to properties on the class itself, insead of those defined within constructor.  Because they are called after the super constructor!
Can't have recursive embeds.  This should work if they're within a loop.

TODO: next goals:
{{var}} in text and attributes, and stylesheets?
Fix failing Edge tests.
allow comments in loops.
x-elements in loops get fully initialized then replaced.  Is this still true?




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

		// 0. If being initialized as x-loop child, just save the html for when the loop creates its children.
		//    Otherwise recursive xelement embeds won't work.
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

			// 8. Bind all data- and event attributes
			// TODO: Move bind into setAttribute above, so we can call it separately for definition and instantiation?
			bindElProps(self, self);


			// We pass root to bind all events on this element's children.
			// We bound events on the element itself in a separate call to bindElEvents(self, self) above.
			bindElEvents(self, root, null, true);
		}
	}
};

/**
 * @extends HTMLElement
 * @extends Node
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


/*
let queuedOps = new Set();
let queueDepth = 0;

XElement.enqueue = function(callback) {
	return function() {
		if (queueDepth === 0)
			return callback();
		else
			queuedOps.add(callback);
	};
};

// Untested.  It might not be possible to use this without screwing things up.
XElement.batch = function(callback) {
	return function() {
		if (queueDepth)
			queuedOps.add(callback);
		else {
			queueDepth++;

			let result = callback(...arguments);

			queueDepth--;
			if (queueDepth === 0) {
				for (let op of queuedOps)
					op();
				queuedOps = new Set();
			}

			return result;
		}
	}
};
*/


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

			let setAttr = /*XElement.batch(*/function (/*action, path, value*/) {
				var result = safeEval.call(self, attrExpr, {el: el});
				if (result === false || result === null || result === undefined)
					el.removeAttribute(name);
				else
					el.setAttribute(name, result + '');
			}/*)*/;

			// If the variables in code, change, execute the code.
			// Then set the attribute to the value returned by the code.
			for (let path of parseVars(attrExpr)) {
				let [root, pathFromRoot] = getRootXElement(self, path);
				watch(root, pathFromRoot, setAttr);
				elWatches.add(el, [self,  path, setAttr]);
			}

			setAttr();
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
			let updateClass = /*XElement.batch*/() => {
				let result = safeEval.call(self, classExpr, {el: el});
				if (result)
					el.classList.add(name);
				else {
					el.classList.remove(name);
					if (!el.classList.length) // remove attribute after last class removed.
						el.removeAttribute('class');
				}
			}/*)*/;


			// Create properties and watch for changes.
			for (let path of parseVars(classExpr)) {
				let [root, pathFromRoot] = getRootXElement(self, path);
				watch(root, path, updateClass);
				elWatches.add(el, [root, pathFromRoot, updateClass]);
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
			let val = safeEval.call(self, code, {el: el});
			if (val === undefined || val === null)
				val = '';
			el.textContent = val;
		};
		for (let path of parseVars(code)) {
			let [root, pathFromRoot] = getRootXElement(self, path);
			watch(root, pathFromRoot, setText);
			elWatches.add(el, [root, pathFromRoot, setText]);
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
			let val = safeEval.call(self, code, {el: el});
			if (val === undefined || val === null)
				val = '';
			el.innerHTML = val;
		};

		for (let path of parseVars(code)) {
			let [root, pathFromRoot] = getRootXElement(self, path);
			watch(root, pathFromRoot, setHtml);
			elWatches.add(el, [root,  pathFromRoot, setHtml]);
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
		context = context || [];

		// Parse code into foreach parts
		let [foreach, loopVar, indexVar] = parseLoop(code);
		foreach = replaceVars(foreach, context);
		foreach = addThis(foreach, context);
		el.context_ = context;  // Used in sortable.

		// Allow loop attrib to be applied above shadowroot.
		let root = el;

		// If we're not looping over slots, set the root to the shadowRoot.
		if (el instanceof XElement && !el.instantiationAttributes['x-loop'] && !el.instantiationAttributes['data-loop'])
			root = root.shadowRoot || root;

		var rebuildChildren = (action, path, value, oldVal, indirect) => {

			// The modification was actually just a child of the loop variable.
			// The loop variable itself wasn't assigned a new value.
			if (indirect) {

				/*
				// If deleting a single item from a list.
				// Commented out because this would only work with simple variables.
				// Maybe later I can find a better way.
				if (action==='delete') {

					debugger;
					let loopItem = traversePath(self, path.slice(0, -1));
					//if (loopItem === el) {
						let index = path.slice(-1)[0];
						let loopEl = el.shadowRoot || el;
						let child = loopEl.children[index];
						unbindEl(child);
						root.removeChild(child);
					//}
				}*/
				return;

			}

			// The code we'll loop over.
			// We store it here because innerHTML is lost if we unbind and rebind.
			if (!root.loopHtml_) {

				//#IFDEV
				if (root.children.length !== 1)
					throw new XElementError('x-loop="' + code + '" must have exactly one child html element.  ' +
						'This restriction may be removed in the future.');
				//#ENDIF

				root.loopHtml_ = root.children[0].outerHTML.trim();

				// Remove children before calling rebuildChildren()
				// That way we don't unbind elements that were never bound.
				while (root.lastChild)
					root.removeChild(root.lastChild);
			}

			//#IFDEV
			if (!root.loopHtml_)
				throw new XElementError('x-loop="' + code + '" rebuildChildren() called before bindEl().');
			//#ENDIF

			var newItems = removeProxy(safeEval.call(self, foreach, {el: el}) || []);
			var oldItems = removeProxy(root.items_ || []);

			// Do nothing if the array hasn't changed.
			if (arrayEq(oldItems, newItems, true))
				return;

			// Set temporary index on each child, so we can track how they're re-ordered.
			for (let i=0; i< root.children.length; i++)
				root.children[i].index_ = i;

			// Create a map from the old items to the elements that represent them.
			// This will fail if anything else has been changing the children order.
			var oldMap = new Map();
			var newSet = new Set(newItems);
			for (let i=oldItems.length-1; i>=0; i--) {
				let oldItem = oldItems[i];
				let child = root.children[i];

				// And remove any elements that are no longer present.
				if (!newSet.has(oldItem)) {
					unbindEl(child);
					root.removeChild(child);
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
				let oldChild = root.children[i];
				let newChild = (oldMap.get(newItems[i]) || []).pop(); // last on, first off b/c above we iterate in reverse.
				let isNew = !newChild;

				// If the existing child doesn't match the new item.
				if (!oldChild || oldChild !== newChild) {

					// Create a new one if needed.
					// TODO: createEl() binds nexted x-elements before we're ready for them to be bound.
					// E.g. below we set the localContext for loop variables.
					if (isNew) {
						disableBind ++;
						newChild = createEl(root.loopHtml_);
						disableBind --;

					}
					// This can either insert the new one or move an old one to this position.
					root.insertBefore(newChild, oldChild);
				}
			}

			// If there are identical items in the array, some extras can be left at the end.
			for (let i=root.children.length-1; i>=newItems.length; i--) {
				let child = root.children[i];
				if (child) {
					unbindEl(child);
					root.removeChild(child);
				}
			}


			// Rebind events on any elements that had their index change.
			for (let i=0; i< root.children.length; i++) {
				let child = root.children[i];
				if (child.index_ !== i) {

					let localContext =  {...context[0]};
					
					//#IFDEV
					if (loopVar in localContext)
						throw new XElementError('Loop variable "' + loopVar + '" already used in outer loop.');
					if (indexVar && indexVar in localContext)
						throw new XElementError('Loop index variable "' + indexVar + '" already used in outer loop.');
					//#ENDIF

					// TODO, if child is an xelement, this won't unbind any events within it!

					// If it wasn't just created:
					//if (child.hasOwnProperty('index_'))
					unbindEl(self, child);

					localContext[loopVar] = foreach + '[' + i + ']';
					if (indexVar !== undefined)
						localContext[indexVar] = i;

					// Save the context on every loop item.
					// This is necessary for updating the x-prop watch below.
					// TODO: That code is removed, so we no longer need this line.
					child.context_ = localContext;

					bindEl(self, child, [localContext, ...context.slice(1)]);
				}
				delete child.index_;
			}

			// Save the items on the loop element, so we can compare them to their modified values next time the loop is rebuilt.
			root.items_ = newItems.slice(); // copy TODO: Should this be el not root?

			// If it's a select element, reapply its x-val when its children change.
			// TODO: Should this also be done for <textarea> ?
			if (el.tagName === 'SELECT' && el.hasAttribute('x-val')) {
				let code = addThis(replaceVars(el.getAttribute('x-val'), context), context);
				el.value = safeEval.call(self, code, {el: el});
			}
		};

		for (let path of parseVars(foreach)) {
			let [root, pathFromRoot] = getRootXElement(self, path);
			watch(root, pathFromRoot, rebuildChildren);
			elWatches.add(el, [root, pathFromRoot, rebuildChildren]);
		}

		// Set initial children
		rebuildChildren();
	},

	/**
	 * @param self {XElement} A parent XElement
	 * @param code {string}
	 * @param el {HTMLElement} An XElement that's a child of self, that has a data-prop attribute.
	 * @param context {object<string, string>[]} */
	prop: (self, code, el, context) => {

		//#IFDEV
		if (!context)
			throw new XElementError();
		if (!Array.isArray(context))
			throw new XElementError();
		if (!(el instanceof XElement))
			throw new XElementError('The data-prop and x-prop attributes can only be used on XElements in ' + code);
		//#ENDIF

		// allow binding only on instantiation and not definition
		if (self !== el) {
			el.parent = self;

			var obj = parseObj(code);
			let newContext = {};
			for (let prop in obj) {

				//#IFDEV
				if (prop === 'this')
					throw new XElementError('Cannot use data-propx or x-prop to bind to "this" as a destination in ' + code);
				//#ENDIF

				// Add 'this' prefix to standaline variables.
				let expr = obj[prop];
				expr = trimThis(expr);
				expr = replaceVars(expr, context);
				expr = addThis(expr, context);


				// Add the parent property to the context.
				let expr2 = expr.replace(/this\./g, 'parent\.'); // TODO: temporary lazy way until I write actual parsing
				expr2 = expr2.replace(/this$/, 'parent');
				newContext[prop] = expr2;

				// Create a property so we can access the parent.
				// This is often deleted and replaced by watch()
				let descriptor = {
					configurable: true,
					get: function () {
						return safeEval.call(self, expr);
					}
				};

				// let paths = parseVars(expr);
				// for (let path of paths)
				// 	watch(self, path, () => {
				// 		el[prop] = safeEval.call(self, expr);
				// 	});


				Object.defineProperty(el, prop, descriptor);


				// Attempt 2:  fails the props test because
				// el.propGetter = function () {
				// 	return safeEval.call(self, expr);
				// };
				//
				// // This will be replaced if something subscribes to prop.
				// Object.defineProperty(el, prop, {
				// 	configurable: true,
				// 	get: function () {
				// 		return safeEval.call(self, expr);
				// 	},
				// 	set: function(val) {
				// 		let paths = parseVars(expr);
				// 		traversePath(self, paths[0], true, val);
				// 	}
				// });

				// Attempt 3: works except for embed, loopnested, and events:
				// Will probably cause too much redraw, as assigning a whole object will trigger updates of all its children.
				// let paths = parseVars(expr);
				// for (let path of paths) {
				// 	let updateProp = function() {
				// 		el[prop] = safeEval.call(self, expr);
				//
				// 	};
				// 	watch(self, path, updateProp);
				// 	elWatches.add(el,[self, path, updateProp]);
				// }
				//
				// el[prop] = safeEval.call(self, expr);
			}

			context.unshift(newContext);
		}
	},

	// Requires Sortable.js
	// does not support dynamic (watch) binding.
	sortable: (self, code, el, context) => {
		var options = {};

		// Build arguments to send to Sortable.
		if (code) { // we also allow a bare sortable attribute with no value.
			var obj = parseObj(code);
			for (let name in obj) {
				let expr = addThis(replaceVars(obj[name], context), context);
				options[name] = safeEval.call(self, expr, {el: el});
			}
		}

		// If sorting items bound to a loop, and the variable is standaline,
		// then update the original array after items are dragged.
		var loopCode = getLoopCode_(el);
		if (loopCode) {

			let [foreach/*, loopVar, indexVar*/] = parseLoop(loopCode);
			//#IFDEV
			if (!isStandaloneVar(foreach))
				throw new XElementError("Binding sortable to non-standalone loop variable.");
			//#ENDIF

			// Get the path to the array we'll update when items are dragged:
			foreach = addThis(replaceVars(foreach, context), context);
			let path = parseVars(foreach)[0];

			// Get values passed in by the user.
			var onAdd = options.onAdd;
			var onUpdate = options.onUpdate;

			// Update the arrays after we drag items.
			var moveItems = function(event) {
				let oldSelf = getXParent(event.from);
				let newSelf = getXParent(event.to);


				// Use slice() to get copies of the modified arrays.
				let oldContext = event.from.context_;
				let oldForeach = parseLoop(getLoopCode_(event.from))[0];
				oldForeach = addThis(replaceVars(oldForeach, oldContext), oldContext);
				let oldArray = safeEval.call(oldSelf, oldForeach, {el: el}).slice();

				let newArray = oldSelf === newSelf ? oldArray : safeEval.call(newSelf, foreach, {el: el}).slice();

				let item;
				if (event.pullMode === 'clone')
					item = oldArray[event.oldIndex];
				else
					item = oldArray.splice(event.oldIndex, 1)[0];

				newArray.splice(event.newIndex, 0, item);
				
				// Without removeProxies(), array items in the original object can be set to proxies, then indexOf() and other functions will fail.
				newArray = removeProxies(newArray);

				// Set the newArray without triggering notifications.
				// Because a notification will cause data-loop's rebuildChildren() to be called
				// And Sortable has already rearranged the elements.
				let array = traversePath(newSelf, path, true, newArray, true);
				WatchUtil.rebuildArray(array); // TODO: Send startIndex
				rebindLoopChildren(newSelf, event.to, context, oldSelf); // But we still need to unbind and rebind them in their currnet positions.
				traversePath(newSelf, path).$trigger(); // This won't trigger rebuilding our own children because their order already matches.


				// If origin was a different loop:
				if (newSelf !== oldSelf && event.pullMode !== 'clone') {

					let loopCode = getLoopCode_(event.from);
					let context = event.from.context_;
					let [foreach/*, loopVar, indexVar*/] = parseLoop(loopCode);
					foreach = addThis(replaceVars(foreach, context), context);
					let oldPath = parseVars(foreach)[0];

					let array = traversePath(oldSelf, oldPath, true, oldArray, true);
					WatchUtil.rebuildArray(array);
					rebindLoopChildren(oldSelf, event.from, context);
					traversePath(oldSelf, oldPath).$trigger();
				}
			};

			options.onAdd = function(event) {
				moveItems(event);
				if (onAdd)
					onAdd.call(self, event);
			};

			options.onUpdate = function(event) {
				moveItems(event);
				if (onUpdate)
					onUpdate.call(self, event);
			};
		}


		Sortable.create(el, options);
	},

	/**
	 * Special 2-way binding
	 * @param self {XElement}
	 * @param code {string}
	 * @param el {HTMLElement|HTMLInputElement}
	 * @param context {object<string, string>} */
	val: (self, code, el, context) => {
		code = addThis(replaceVars(code, context), context);

		// Update object property when input value changes, only if a simple var.
		var paths = parseVars(code);
		if (paths.length === 1 && isStandaloneVar(code)) {
			let onInput = () => {
				let value = '';
				if (el.type === 'checkbox')
					value = el.checked;
				else if ('value' in el) // input, select
					value = el.value;
				else if (typeof el.innerHTML === 'string') // textarea, [contenteditable].  'innerHTML' in el evaluates to false, for unknown reasons.
					value = el.innerHTML;

				// We don't use watchlessSet in case other things are subscribed.
				traversePath(self, paths[0], true, value);
			};

			el.addEventListener('input', onInput);

			// Add so this binding is removed when the element is unbound (but still exists),
			// such as when it moves to a different spot in a loop or from x-sortable.
			// Covered by test simpleBinding.val.unbind()
			elEvents.add(el, ['input', onInput, null, self]);
		}

		function setVal(/*action, path, value*/) {
			let result = safeEval.call(self, code, {el: el});
			if (result === undefined || result === null)
				result = '';

			if (el.type === 'checkbox')
				// noinspection EqualityComparisonWithCoercionJS
				el.checked = result == true;
			else if (el.hasAttribute('contenteditable')) {
				if (result !== el.innerHTML)
					el.innerHTML = result;
			}
			else
				el.value = result;
		}

		// Update input value when object property changes.
		for (let path of paths) {
			let [root, pathFromRoot] = getRootXElement(self, path);
			watch(root, pathFromRoot, setVal);
			elWatches.add(el, [root, pathFromRoot, setVal]);
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
			el.style.display = safeEval.call(self, code, {el: el}) ? displayNormal : 'none';
		};

		for (let path of parseVars(code)) {
			let [root, pathFromRoot] = getRootXElement(self, path);
			watch(root, pathFromRoot, setVisible);
			elWatches.add(el, [root, pathFromRoot, setVisible]);
		}

		// Set initial value.
		setVisible();
	},

	/*
	'style': function(self, field, el) {}, // Can point to an object to use for the style.
	'if': function(self, field, el) {}, // Element is created or destroyed when data-if="code" evaluates to true or false.
	*/
};


/**
 * Unbind and rebind every child of element el with data-loop attribute.
 * TODO: Only update changed children.  Merge from this and similar code in rebuildChildren().
 * @param self {XElement}
 * @param el {HTMLElement}
 * @param context {object<string, string>[]}
 * @param oldSelf {XElement=} Will be different than self if the items were moved from one list to another. */
var rebindLoopChildren = function(self, el, context, oldSelf) {
	oldSelf = oldSelf || self;
	let [foreach, loopVar, indexVar] = parseLoop(getLoopCode_(el));
	foreach = addThis(replaceVars(foreach, context), context);

	let localContext = {...context[0]};
	for (let i=0; i<el.children.length; i++) {
		let child = el.children[i];

		unbindEl(oldSelf, child);

		localContext[loopVar] = foreach + '[' + i + ']';
		if (indexVar !== undefined)
			localContext[indexVar] = i;


		bindEl(self, child, [localContext, ...context.slice(1)]);
	}

	el.items_ = safeEval.call(self, foreach).slice();
	//delete el.items_;
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
XElement.createEl = createEl; // useful for other code.
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