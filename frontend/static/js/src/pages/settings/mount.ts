// pages/settings/mount.ts — Phase C3 wave 5 router adapters.
// Two routes (settings + personalization) so two mount functions.

import { createElement } from 'react';
import { mountReact } from '../../react/reactMount.js';
import { Settings } from './Settings.js';
import { Personalization } from './Personalization.js';

export function mountSettings(container: HTMLElement): void {
    mountReact(container, createElement(Settings));
}

export function mountPersonalization(container: HTMLElement): void {
    mountReact(container, createElement(Personalization));
}
