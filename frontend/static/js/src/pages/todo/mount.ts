// pages/todo/mount.ts — Phase C3 router adapter for the React Todo
// page. Same shape as pages/insights/mount.ts.

import { createElement } from 'react';
import { mountReact } from '../../react/reactMount.js';
import { Todo } from './Todo.js';

export function mountTodo(container: HTMLElement): void {
    mountReact(container, createElement(Todo));
}
