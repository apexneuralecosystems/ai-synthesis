import { Routes, Route } from 'react-router-dom'
import { MeetingsProvider } from './context/MeetingsContext'
import Layout from './components/Layout'
import Meetings from './pages/Meetings'
import MeetingDetail from './pages/MeetingDetail'
import Bin from './pages/Bin'
import Synthesis from './pages/Synthesis'
import Reports from './pages/Reports'
import ReportDetail from './pages/ReportDetail'
import DeltaAnalysis from './pages/DeltaAnalysis'
import DeltaDetail from './pages/DeltaDetail'
import Survey from './pages/Survey'

export default function App() {
  return (
    <MeetingsProvider>
      <Layout>
        <Routes>
        <Route path="/" element={<Meetings />} />
        <Route path="/meeting/:id" element={<MeetingDetail />} />
        <Route path="/bin" element={<Bin />} />
        <Route path="/synthesis" element={<Synthesis />} />
        <Route path="/survey" element={<Survey />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reports/:id" element={<ReportDetail />} />
        <Route path="/delta" element={<DeltaAnalysis />} />
        <Route path="/delta/:id" element={<DeltaDetail />} />
        </Routes>
      </Layout>
    </MeetingsProvider>
  )
}
