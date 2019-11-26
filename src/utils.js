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

// Shortened version of this answer: stackoverflow.com/a/18751951
var events = Object.keys(document.__proto__.__proto__)
	.filter((x) => x.startsWith('on'))
	.map(   (x) => x.slice(2));
