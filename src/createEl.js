import {XElementError} from "./utils.js";

var createElMap = {};



var createEl = (html) => {
	let existing = createElMap[html];
	if (existing)
		return existing.cloneNode(true);


	//#IFDEV
	if (typeof html !== 'string')
		throw new XElementError('Html argument must be a string.');
	//#ENDIF

	let tagNames = html.trim().match(/<([a-z0-9-]+)/i);
	let tagName = tagNames.length<1 ? tagNames[1] : undefined;

	// Using a template makes some embed related tests fail to instantiate x-elements.
	let parentMap = {
		td: 'tr',
		tr: 'tbody',
		tbody: 'table',
		thead: 'table',
		tfoot: 'table',
		source: 'video',
		area: 'map',
		legend: 'fieldset',
		option: 'select',
		col: 'colgroup',
		param: 'object'
	};
	let parentTag = parentMap[tagName] || 'div';

	var parent = document.createElement(parentTag);
	parent.innerHTML = html;
	var result = parent.removeChild(parent.firstChild);

	createElMap[html] = result.cloneNode(true);
	return result; // clone so that subsequent changes don't break our cache.
};


export {createEl};