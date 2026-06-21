import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import Cockpit from './Cockpit'

// One renderer bundle, two windows: the menu-bar picker (default) and the
// full cockpit window (opened with ?view=cockpit by the main process).
const is_cockpit = new URLSearchParams(window.location.search).get('view') === 'cockpit'

createRoot(document.getElementById('root')).render(is_cockpit ? <Cockpit /> : <App />)
