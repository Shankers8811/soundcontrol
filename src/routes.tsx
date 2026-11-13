import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Devices } from './pages/Devices'
import { NoiseControl } from './pages/NoiseControl'
import { Equalizer } from './pages/Equalizer'
import { Battery } from './pages/Battery'
import { Diagnostics } from './pages/Diagnostics'
import { Settings } from './pages/Settings'
import { useDeviceStore } from './stores/devices'

export const Routes: React.FC = () => {
  const { connectedDevice } = useDeviceStore()
  
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={
          connectedDevice ? <Navigate to="/devices" replace /> : <Navigate to="/devices" replace />
        } />
        <Route path="/devices" element={<Devices />} />
        <Route path="/anc" element={<NoiseControl />} />
        <Route path="/eq" element={<Equalizer />} />
        <Route path="/battery" element={<Battery />} />
        <Route path="/diagnostics" element={<Diagnostics />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </BrowserRouter>
  )
}
