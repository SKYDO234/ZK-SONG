import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import { AppProvider } from '../src/context/AppContext';

export function renderRoute(path) {
  return renderToString(
    React.createElement(
      MemoryRouter,
      { initialEntries: [path] },
      React.createElement(AppProvider, null, React.createElement(App))
    )
  );
}
