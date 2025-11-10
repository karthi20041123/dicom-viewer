import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Activity,
  Eye,
  Clock,
  TrendingUp,
  Users,
  FileText,
  Calendar,
  Download,
  ArrowLeft,
  Settings,
  Zap,
  Search,
} from 'lucide-react';
import './AnalyticsDashboard.css';

const COLORS = ['#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#6366f1'];

/* -------------------------------------------------------------
   AnalyticsTracker – FULLY CLEAN & LEGACY-PROOF
   ------------------------------------------------------------- */
const AnalyticsTracker = {
  trackLogin: () => {
    const analytics = JSON.parse(localStorage.getItem('dicomAnalytics') || '{}');
    analytics.totalLogins = (analytics.totalLogins || 0) + 1;
    analytics.lastLogin = new Date().toISOString();
    const loginDates = analytics.loginDates || [];
    const today = new Date().toISOString().split('T')[0];
    if (!loginDates.includes(today)) loginDates.push(today);
    analytics.loginDates = loginDates;
    analytics.activeDays = loginDates.length;
    localStorage.setItem('dicomAnalytics', JSON.stringify(analytics));
  },
  trackSessionStart: () => {
    sessionStorage.setItem('sessionStart', Date.now().toString());
    sessionStorage.removeItem('pausedTime');
  },
  trackSessionEnd: () => {
    const start = parseInt(sessionStorage.getItem('sessionStart') || '0');
    const paused = parseInt(sessionStorage.getItem('pausedTime') || '0');
    if (start) {
      const duration = Math.floor((Date.now() - start - paused) / 1000);
      const analytics = JSON.parse(localStorage.getItem('dicomAnalytics') || '{}');
      analytics.totalSessionDuration = (analytics.totalSessionDuration || 0) + duration;
      analytics.sessionCount = (analytics.sessionCount || 0) + 1;
      localStorage.setItem('dicomAnalytics', JSON.stringify(analytics));
    }
    sessionStorage.removeItem('sessionStart');
    sessionStorage.removeItem('pausedTime');
  },
  trackFileView: (fileName) => {
    const analytics = JSON.parse(localStorage.getItem('dicomAnalytics') || '{}');
    analytics.filesViewed = (analytics.filesViewed || 0) + 1;
    sessionStorage.setItem('fileViewStart', Date.now().toString());
    sessionStorage.setItem('currentFileName', fileName);
    const list = analytics.viewedFilesList || [];
    list.push({ name: fileName, timestamp: new Date().toISOString() });
    analytics.viewedFilesList = list;
    localStorage.setItem('dicomAnalytics', JSON.stringify(analytics));
  },
  trackFileViewEnd: () => {
    const start = parseInt(sessionStorage.getItem('fileViewStart') || '0');
    if (start) {
      const duration = Math.floor((Date.now() - start) / 1000);
      const analytics = JSON.parse(localStorage.getItem('dicomAnalytics') || '{}');
      analytics.totalViewingTime = (analytics.totalViewingTime || 0) + duration;
      localStorage.setItem('dicomAnalytics', JSON.stringify(analytics));
      sessionStorage.removeItem('fileViewStart');
    }
  },
  trackStudyView: (studyId) => {
    const analytics = JSON.parse(localStorage.getItem('dicomAnalytics') || '{}');
    analytics.studiesViewed = (analytics.studiesViewed || 0) + 1;
    const unique = analytics.uniqueStudies || [];
    if (!unique.includes(studyId)) unique.push(studyId);
    analytics.uniqueStudies = unique;
    localStorage.setItem('dicomAnalytics', JSON.stringify(analytics));
  },

  trackToolUsage: (rawToolName) => {
    let cleanName = rawToolName?.trim();

    if (!cleanName) return;

    if (/cine/i.test(cleanName)) cleanName = 'Cine';
    else if (/magnify/i.test(cleanName)) cleanName = 'Magnify';
    else if (/measure/i.test(cleanName)) cleanName = 'Measure';
    else if (cleanName === 'Wwwc' || /window/i.test(cleanName)) cleanName = 'Window Level';
    else if (/export/i.test(cleanName)) cleanName = 'Export';
    else if (/mpr/i.test(cleanName)) cleanName = 'MPR';
    else if (/layout/i.test(cleanName)) cleanName = 'Layout';
    else if (/reset/i.test(cleanName)) cleanName = 'Reset';
    else if (/share/i.test(cleanName)) cleanName = 'Share';
    else if (/zoom/i.test(cleanName)) cleanName = 'Zoom';
    else if (/pan/i.test(cleanName)) cleanName = 'Pan';
    else if (/segmentation/i.test(cleanName)) cleanName = 'Segmentation';

    const analytics = JSON.parse(localStorage.getItem('dicomAnalytics') || '{}');
    const usage = analytics.toolUsage || {};
    usage[cleanName] = (usage[cleanName] || 0) + 1;
    analytics.toolUsage = usage;

    const ts = analytics.usageTimestamps || [];
    ts.push({
      tool: cleanName,
      timestamp: new Date().toISOString(),
      hour: new Date().getHours(),
      day: new Date().getDay(),
    });
    analytics.usageTimestamps = ts;

    localStorage.setItem('dicomAnalytics', JSON.stringify(analytics));
  },

  trackLoadTime: (ms) => {
    const analytics = JSON.parse(localStorage.getItem('dicomAnalytics') || '{}');
    const times = analytics.loadTimes || [];
    times.push(ms);
    analytics.loadTimes = times;
    localStorage.setItem('dicomAnalytics', JSON.stringify(analytics));
  },
  getAnalytics: () => JSON.parse(localStorage.getItem('dicomAnalytics') || '{}'),
  resetAnalytics: () => localStorage.removeItem('dicomAnalytics'),
};

/* -------------------------------------------------------------
   AnalyticsDashboard component
   ------------------------------------------------------------- */
const AnalyticsDashboard = ({ onBack }) => {
  const [analytics, setAnalytics] = useState({});
  const [range, setRange] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    migrateLegacyData();
    loadAnalytics();
    const int = setInterval(() => {
      loadAnalytics();
      setLastUpdated(new Date());
    }, 5000);
    return () => clearInterval(int);
  }, [range]);

  const migrateLegacyData = () => {
    const raw = localStorage.getItem('dicomAnalytics');
    if (!raw) return;

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    let changed = false;
    const newUsage = {};

    if (data.toolUsage) {
      for (const [key, count] of Object.entries(data.toolUsage)) {
        let clean = key;
        if (/cine/i.test(clean)) clean = 'Cine';
        else if (/magnify/i.test(clean)) clean = 'Magnify';
        else if (/measure/i.test(clean)) clean = 'Measure';
        else if (clean === 'Wwwc') clean = 'Window Level';
        else if (/export/i.test(clean)) clean = 'Export';
        else if (/mpr/i.test(clean)) clean = 'MPR';
        else if (/layout/i.test(clean)) clean = 'Layout';
        else if (/reset/i.test(clean)) clean = 'Reset';
        else if (/share/i.test(clean)) clean = 'Share';
        else if (/zoom/i.test(clean)) clean = 'Zoom';
        else if (/pan/i.test(clean)) clean = 'Pan';
        else if (/segmentation/i.test(clean)) clean = 'Segmentation';

        newUsage[clean] = (newUsage[clean] || 0) + count;
        if (clean !== key) changed = true;
      }
    }

    if (changed) {
      data.toolUsage = newUsage;
      localStorage.setItem('dicomAnalytics', JSON.stringify(data));
    }
  };

  useEffect(() => {
    let pauseStart = 0;
    const onBlur = () => (pauseStart = Date.now());
    const onFocus = () => {
      if (pauseStart) {
        const paused = Date.now() - pauseStart;
        const total = parseInt(sessionStorage.getItem('pausedTime') || '0') + paused;
        sessionStorage.setItem('pausedTime', total.toString());
        pauseStart = 0;
      }
    };
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const loadAnalytics = () => setAnalytics(AnalyticsTracker.getAnalytics());

  const filterByRange = (items, key) => {
    if (!items || range === 'all') return items;
    const days = range === '7d' ? 7 : 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return items.filter((i) => i && i[key] && new Date(i[key]).getTime() >= cutoff);
  };

  const filteredTS = filterByRange(analytics.usageTimestamps, 'timestamp');
  const filteredFiles = filterByRange(analytics.viewedFilesList, 'timestamp');

  const formatTime = (seconds) => {
    if (!seconds) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
  };

  const avgSession = () => {
    if (!analytics.totalSessionDuration || !analytics.sessionCount) return '0s';
    const secs = Math.floor(analytics.totalSessionDuration / analytics.sessionCount);
    return formatTime(secs);
  };

  const avgViewing = () => {
    if (!analytics.totalViewingTime || !analytics.filesViewed) return 0;
    return Math.floor(analytics.totalViewingTime / analytics.filesViewed);
  };

  const toolData = useMemo(() => {
    if (!analytics.toolUsage) return [];
    return Object.entries(analytics.toolUsage)
      .map(([name, usage]) => ({ name, usage }))
      .sort((a, b) => b.usage - a.usage);
  }, [analytics.toolUsage]);

  const mostUsedTool = () => toolData[0]?.name || 'None';

  const peakHour = () => {
    if (!filteredTS?.length) return 'No data';
    const counts = {};
    filteredTS.forEach((e) => (counts[e.hour] = (counts[e.hour] || 0) + 1));
    const [h] = Object.entries(counts).reduce((a, b) => (b[1] > a[1] ? b : a), ['0', 0]);
    return `${String(h).padStart(2, '0')}:00`;
  };

  const weeklyActivity = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    filteredTS?.forEach((e) => counts[e.day]++);
    return days.map((d, i) => ({ day: d, activity: counts[i] }));
  };

  const recentActivity = () => {
    let list = (filteredFiles || [])
      .filter(f => f && typeof f.name === 'string')
      .slice(-50)
      .reverse();

    if (searchQuery?.trim()) {
      const query = searchQuery.toLowerCase().trim();
      list = list.filter(f => f.name.toLowerCase().includes(query));
    }

    return list.slice(0, 10);
  };

  const avgLoad = () => {
    if (!analytics.loadTimes || analytics.loadTimes.length === 0) return 0;
    return Math.floor(
      analytics.loadTimes.reduce((a, b) => a + b, 0) / analytics.loadTimes.length
    );
  };

  const engagementScore = () => {
    const f = analytics.filesViewed || 0;
    const l = analytics.totalLogins || 0;
    const d = analytics.activeDays || 0;
    const t = Object.keys(analytics.toolUsage || {}).length;
    return Math.min(100, Math.floor(f * 0.4 + l * 0.3 + d * 1.5 + t * 2));
  };

  const formatTimeNoSeconds = (timestamp) => {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '—'; // Prevent invalid date crash
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  // const exportCSV = () => {
  //   const rows = [
  //     ['Metric', 'Value'],
  //     ['Total Logins', analytics.totalLogins || 0],
  //     ['Active Days', analytics.activeDays || 0],
  //     ['Files Viewed', analytics.filesViewed || 0],
  //     ['Unique Studies', analytics.uniqueStudies?.length || 0],
  //     ['Avg Session', avgSession()],
  //     ['Total Session Time', formatTime(analytics.totalSessionDuration || 0)],
  //     ['Most Used Tool', mostUsedTool()],
  //     ['Peak Hour', peakHour()],
  //     ['Avg Load Time (ms)', avgLoad()],
  //     ['Engagement Score', `${engagementScore()}%`],
  //   ];
  //   const csv = rows.map((r) => r.join(',')).join('\n');
  //   const blob = new Blob([csv], { type: 'text/csv' });
  //   const url = URL.createObjectURL(blob);
  //   const a = document.createElement('a');
  //   a.href = url;
  //   a.download = `dicom-analytics-${new Date().toISOString().split('T')[0]}.csv`;
  //   a.click();
  // };

  // const exportJSON = () => {
  //   const blob = new Blob([JSON.stringify(analytics, null, 2)], { type: 'application/json' });
  //   const url = URL.createObjectURL(blob);
  //   const a = document.createElement('a');
  //   a.href = url;
  //   a.download = `dicom-analytics-${new Date().toISOString().split('T')[0]}.json`;
  //   a.click();
  // };

  // const resetAnalytics = () => {
  //   if (window.confirm('Reset all analytics? This cannot be undone.')) {
  //     AnalyticsTracker.resetAnalytics();
  //     loadAnalytics();
  //   }
  // };

  const isLoading = Object.keys(analytics).length === 0;

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="header-card">
        <div className="header-layout">
          {/* Back Button */}
          {onBack && (
            <button onClick={onBack} className="btn-back">
              <ArrowLeft size={20} /> Back
            </button>
          )}

          {/* Title - Pushed Right */}
          <h1 className="header-title">Analytics Dashboard</h1>

          {/* Action Buttons */}
          {/* <div className="header-actions">
            <button onClick={exportCSV} className="btn-export csv">
              <Download size={18} /> CSV
            </button>
            <button onClick={exportJSON} className="btn-export json">
              <Download size={18} /> JSON
            </button>
            <button onClick={resetAnalytics} className="btn-reset">
              Reset
            </button>
          </div> */}
        </div>

        <div className="updated-time">
          <p>Updated: {lastUpdated.toLocaleTimeString()}</p>
        </div>
      </div>

      {/* Range Filter */}
      <div className="range-filter">
        <select value={range} onChange={(e) => setRange(e.target.value)} className="range-select">
          <option value="all">All Time</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
        </select>
      </div>

      {isLoading ? (
        <div className="loading-spinner">
          <div className="spinner"></div>
        </div>
      ) : (
        <>
          {/* Key Metrics */}
          <div className="metrics-grid">
            {[
              { label: 'Total Logins', value: analytics.totalLogins || 0, icon: Users, extra: `Active: ${analytics.activeDays || 0} days` },
              { label: 'Avg Session', value: avgSession(), icon: Clock, extra: `Total: ${formatTime(analytics.totalSessionDuration || 0)}` },
              { label: 'Files Viewed', value: analytics.filesViewed || 0, icon: Eye, extra: `Avg: ${avgViewing()}s` },
              { label: 'Studies Viewed', value: analytics.uniqueStudies?.length || 0, icon: FileText, extra: 'Unique studies' },
            ].map((m, i) => (
              <div key={i} className="metric-card">
                <div className="metric-header">
                  <div>
                    <p className="metric-label">{m.label}</p>
                    <h2 className="metric-value">{m.value}</h2>
                  </div>
                  <div className="metric-icon">
                    <m.icon size={24} />
                  </div>
                </div>
                <p className="metric-extra">{m.extra}</p>
              </div>
            ))}
          </div>

          {/* Charts Row */}
          <div className="charts-grid">
            {/* Tool Usage */}
            <div className="chart-card">
              <div className="chart-header">
                <Settings size={24} />
                <h3>Tool Usage</h3>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={toolData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={70} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="usage" fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
              <p className="chart-note">Most Used: <strong>{mostUsedTool()}</strong></p>
            </div>

            {/* Weekly Activity */}
            <div className="chart-card">
              <div className="chart-header">
                <Calendar size={24} />
                <h3>Weekly Activity</h3>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={weeklyActivity()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="activity" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.6} />
                </AreaChart>
              </ResponsiveContainer>
              <p className="chart-note">Peak Hour: <strong>{peakHour()}</strong></p>
            </div>

            {/* Tool Distribution */}
            <div className="chart-card">
              <div className="chart-header">
                <Zap size={24} />
                <h3>Tool Distribution</h3>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={toolData}
                    dataKey="usage"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    isAnimationActive={false}
                  >
                    {toolData.map((entry, i) => (
                      <Cell key={`cell-${entry.name}`} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bottom Row */}
          <div className="bottom-grid">
            {/* Recent Activity */}
            <div className="activity-card">
              <div className="chart-header">
                <Activity size={24} />
                <h3>Recent Activity</h3>
              </div>
              <div className="search-bar">
                <Search size={18} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
              </div>
              <div className="activity-list">
                {recentActivity().length ? (
                  recentActivity().map((a, i) => (
                    <div key={i} className="activity-item">
                      <div className="activity-name">
                        <FileText size={16} />
                        <span>{a.name}</span>
                      </div>
                      <span className="activity-time">{formatTimeNoSeconds(a.timestamp)}</span>
                    </div>
                  ))
                ) : (
                  <p className="no-activity">No recent activity</p>
                )}
              </div>
            </div>

            {/* Performance */}
            <div className="performance-card">
              <div className="chart-header">
                <TrendingUp size={24} />
                <h3>Performance</h3>
              </div>
              <div className="performance-bars">
                {[
                  { label: 'Avg Load Time', value: `${avgLoad()}ms`, max: 3000, color: avgLoad() < 1000 ? 'bg-green-500' : avgLoad() < 2000 ? 'bg-yellow-500' : 'bg-red-500' },
                  { label: 'Tool Variety', value: `${Object.keys(analytics.toolUsage || {}).length} tools`, max: 10, color: 'bg-purple-500' },
                  { label: 'Engagement Score', value: `${engagementScore()}%`, max: 100, color: 'bg-gradient-to-r from-purple-600 to-pink-600' },
                ].map((item, i) => (
                  <div key={i} className="progress-item">
                    <div className="progress-labels">
                      <span>{item.label}</span>
                      <span>{item.value}</span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className={`progress-fill ${item.color}`}
                        style={{ width: `${Math.min((parseInt(item.value) / item.max) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export { AnalyticsTracker };
export default AnalyticsDashboard;