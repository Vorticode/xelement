function arrayEq(array1, array2) {
	return array1.length === array2.length && array1.every((value, index) => value === array2[index])
}

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


/**
 * @param obj {object}
 * @param path {string[]}
 * @param create {boolean=false}
 * @param value If not undefined, set the object's path field to this value. */
function traversePath(obj, path, create, value) {
	for (let i=0; i<path.length; i++) {
		let srcProp = path[i];

		// If the path is undefined and we're not to the end yet:
		if (obj[srcProp] === undefined) {

			// If the next index is an integer or integer string.
			if (create) {

				// If last item in path
				if (i === path.length-1) {
					if (value !== undefined)
						obj[srcProp] = value;
				}

				// If next level path is a number, create as an array
				else if ((path[i + 1] + '').match(/^\d+$/))
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



// Shortened version of this answer: stackoverflow.com/a/18751951
var events = Object.keys(document.__proto__.__proto__)
	.filter((x) => x.startsWith('on'))
	.map(   (x) => x.slice(2));


