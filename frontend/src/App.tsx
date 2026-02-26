import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Meetings from './pages/Meetings'
import MeetingDetail from './pages/MeetingDetail'
import Synthesis from './pages/Synthesis'
import Reports from './pages/Reports'
import ReportDetail from './pages/ReportDetail'
import DeltaAnalysis from './pages/DeltaAnalysis'
import DeltaDetail from './pages/DeltaDetail'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Meetings />} />
        <Route path="/meeting/:id" element={<MeetingDetail />} />
        <Route path="/synthesis" element={<Synthesis />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reports/:id" element={<ReportDetail />} />
        <Route path="/delta" element={<DeltaAnalysis />} />
        <Route path="/delta/:id" element={<DeltaDetail />} />
      </Routes>
    </Layout>
  )
}
