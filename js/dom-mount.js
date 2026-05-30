/**
 * DOM mounting helpers — single place for innerHTML assignment and fragment assembly.
 */
'use strict';

function mountHtml(element, htmlString) {
    if (!element) {
        return;
    }
    element.innerHTML = htmlString ?? '';
}

function clearElement(element) {
    mountHtml(element, '');
}

function setElementVisible(element, visible) {
    if (!element) {
        return;
    }
    element.hidden = !visible;
    element.style.display = visible ? '' : 'none';
}

function appendHtml(parent, htmlString) {
    if (!parent) {
        return;
    }
    const template = document.createElement('template');
    template.innerHTML = htmlString;
    parent.appendChild(template.content.cloneNode(true));
}

function mountFragment(parent, fragment) {
    if (!parent || !fragment) {
        return;
    }
    parent.appendChild(fragment);
}

function createElementFromHtml(tagName, className, htmlString) {
    const el = document.createElement(tagName);
    if (className) {
        el.className = className;
    }
    if (htmlString) {
        mountHtml(el, htmlString);
    }
    return el;
}

if (typeof globalThis !== 'undefined') {
    globalThis.mountHtml = mountHtml;
    globalThis.clearElement = clearElement;
    globalThis.setElementVisible = setElementVisible;
    globalThis.appendHtml = appendHtml;
    globalThis.mountFragment = mountFragment;
    globalThis.createElementFromHtml = createElementFromHtml;
}
