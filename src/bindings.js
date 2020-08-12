import {arrayEq, createEl, safeEval, traversePath, XElementError} from './utils.js';
import {addThis, isStandaloneVar, parseLoop, parseObj, parseVars, replaceVars, trimThis} from './parsevars.js';
import {removeProxy, watch} from './watch.js';
import {elEvents, elWatches, bindEl, unbindEl, getRootXElement, getXParent } from './xelement.js';

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
				watch(root, pathFromRoot, updateClass);
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
		let setText = (/*action, path, value, oldVal*/) => {
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
		let setHtml = (/*action, path, value, oldVal*/) => {
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
			// Although indirect will also be true if adding or removing an item from the array.
			// If foreach is non-standaline, we don't know how the path will be evaluated to the array used by foreach.
			// So this is of no use right now.
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
				//return;
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

			// We don't know how the path will be evaluated to the array used by foreach, so we re-evaluate it to find out.
			// TODO: Skip this step and just use the path directly for standalone paths.
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
						XElement.disableBind ++;
						newChild = createEl(root.loopHtml_);
						XElement.disableBind --;

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
			for (let i=0; i<root.children.length; i++) {
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
				throw new XElementError("Cannot bind sortable to non-standalone loop variable.");
			//#ENDIF


			// Update the arrays after we drag items.
			var moveItems = function(event) {

				// Update for sorting within a list.
				// Remove for dragging between lists, even if cloning.
				// Intercepting these events makes the variable el above always be the receiver.
				if (event.type === 'update' || (event.type === 'add')) {
					let item;

					// Move the element back to where it came from.
					if (event.pullMode === 'clone')
						event.to.removeChild(event.to.children[event.newIndex]);
					else {
						item = event.to.children[event.newIndex];
						event.from.insertBefore(item, event.from.children[event.oldIndex]);
					}

					// Instead we'll move it by updating the underlying data structures.
					let oldArray = getLoopElArray_(event.from);
					let newArray = oldArray;
					if (event.from !== event.to)
						newArray = getLoopElArray_(event.to);


					if (event.pullMode === 'clone')
						item = oldArray[event.oldIndex];
					else {
						item = oldArray.splice(event.oldIndex, 1)[0];
					}



					// TODO: RemoveProxies() from item.  Or modify the arra intercept functions to removeProxies() from all arguments?
					newArray.splice(event.newIndex, 0, item.$removeProxy || item);

					// Update event.item, since we manually moved it above.
					event.item = event.to.children[event.newIndex];
				}

			

			};

			// Intercept all events so we can set the proper "this" context when calling the callback.
			let events = 'setData,onChoose,onUnchoose,onStart,onEnd,onAdd,onUpdate,onSort,onRemove,onFilter,onMove,onClone,onChange'.split(/,/g);
			//let events = ['onEnd'];

			for (let eventName of events) {

				let callback = options[eventName];


				options[eventName] = function (event) {
					moveItems(event);
					if (callback)
					 	return callback.call(self, event);
				};
			}
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

var getLoopElArray_ = (loopEl, xparent) => {
	xparent = xparent || getXParent(loopEl);
	let context = loopEl.context_;
	let foreach = parseLoop(getLoopCode_(loopEl))[0];
	foreach = addThis(replaceVars(foreach, context), context);
	return safeEval.call(xparent, foreach, {el: loopEl});
};

export default bindings;