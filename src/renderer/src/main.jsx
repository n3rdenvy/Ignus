import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import Cockpit from './Cockpit'
import Queue from './Queue'

// One renderer bundle, three windows (chosen by ?view=): the menu-bar picker
// (default), the Toolbox (?view=cockpit), and the generation Queue (?view=queue).
const view = new URLSearchParams(window.location.search).get('view')
const Root = view === 'cockpit' ? Cockpit : view === 'queue' ? Queue : App

createRoot(document.getElementById('root')).render(<Root />)
