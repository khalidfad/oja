/**
 * mock/data.js — realistic sample data, no server needed
 */

export const HOSTS = [
    {
        id: 'api-example-com',
        hostname: 'api.example.com',
        alive: true, tls: true, tlsMode: 'auto', tlsDaysLeft: 42,
        totalReqs: 148320, errors: 12, p99Ms: 84, activeBackends: 3,
        domains: ['api.example.com', 'api2.example.com'],
        routes: [
            {
                path: '/v1/users', method: 'HTTP',
                backends: [
                    { url: 'http://10.0.0.1:8080', alive: true,  weight: 10, reqs: 52100, p99: 72 },
                    { url: 'http://10.0.0.2:8080', alive: true,  weight: 10, reqs: 51200, p99: 88 },
                    { url: 'http://10.0.0.3:8080', alive: false, weight: 0,  reqs: 44020, p99: 210 },
                ]
            },
            {
                path: '/v1/orders', method: 'HTTP',
                backends: [
                    { url: 'http://10.0.1.1:9000', alive: true, weight: 5, reqs: 1000, p99: 44 },
                ]
            }
        ]
    },
    {
        id: 'app-example-com',
        hostname: 'app.example.com',
        alive: true, tls: true, tlsMode: 'auto', tlsDaysLeft: 5,
        totalReqs: 98210, errors: 0, p99Ms: 32, activeBackends: 2,
        domains: ['app.example.com'],
        routes: [
            {
                path: '/', method: 'HTTP',
                backends: [
                    { url: 'http://10.0.2.1:3000', alive: true, weight: 1, reqs: 98210, p99: 32 },
                ]
            }
        ]
    },
    {
        id: 'db-internal',
        hostname: 'db.internal',
        alive: false, tls: false, tlsMode: 'none', tlsDaysLeft: null,
        totalReqs: 3200, errors: 3200, p99Ms: 0, activeBackends: 0,
        domains: ['db.internal'], routes: []
    },
    {
        id: 'cdn-assets-com',
        hostname: 'cdn.assets.com',
        alive: true, tls: true, tlsMode: 'local', tlsDaysLeft: 120,
        totalReqs: 2100000, errors: 44, p99Ms: 12, activeBackends: 5,
        domains: ['cdn.assets.com', 'static.assets.com'],
        routes: [
            {
                path: '/images', method: 'HTTP',
                backends: [
                    { url: 'http://10.0.3.1:80', alive: true, weight: 1, reqs: 1050000, p99: 11 },
                    { url: 'http://10.0.3.2:80', alive: true, weight: 1, reqs: 1050000, p99: 13 },
                ]
            }
        ]
    },
    {
        id: 'mail-example-com',
        hostname: 'mail.example.com',
        alive: true, tls: true, tlsMode: 'auto', tlsDaysLeft: 88,
        totalReqs: 410, errors: 2, p99Ms: 240, activeBackends: 1,
        domains: ['mail.example.com'], routes: []
    }
];

export const FIREWALL_RULES = [
    { ip: '185.220.101.45', reason: 'Tor exit node',     scope: '*',             created_at: '2025-01-10T08:00:00Z', permanent: true  },
    { ip: '192.168.99.100', reason: 'Brute force login', scope: '/admin',        created_at: '2025-03-01T14:22:00Z', permanent: false },
    { ip: '10.0.99.0/24',   reason: 'Internal abuse',    scope: '/api/v1/users', created_at: '2025-03-15T09:10:00Z', permanent: true  },
];

export const LOGS = [
    { ts: '12:34:01', level: 'INFO',  msg: 'Request completed',  method: 'GET',    path: '/v1/users',   status: 200, duration: '84ms',  remote: '203.0.113.1' },
    { ts: '12:34:02', level: 'WARN',  msg: 'Slow backend',       method: 'POST',   path: '/v1/orders',  status: 201, duration: '412ms', remote: '203.0.113.2' },
    { ts: '12:34:03', level: 'ERROR', msg: 'Backend unreachable', method: 'GET',   path: '/v1/users',   status: 502, duration: '30ms',  remote: '203.0.113.3' },
    { ts: '12:34:04', level: 'INFO',  msg: 'Request completed',  method: 'GET',    path: '/',           status: 200, duration: '12ms',  remote: '198.51.100.1' },
    { ts: '12:34:05', level: 'INFO',  msg: 'TLS certificate renewed', method: '', path: '',            status: 0,   duration: '',      remote: ''             },
    { ts: '12:34:06', level: 'WARN',  msg: 'High latency',       method: 'GET',    path: '/images',     status: 200, duration: '890ms', remote: '198.51.100.2' },
    { ts: '12:34:07', level: 'INFO',  msg: 'Request completed',  method: 'DELETE', path: '/v1/users/9', status: 204, duration: '22ms',  remote: '203.0.113.1' },
    { ts: '12:34:08', level: 'ERROR', msg: 'Connection refused', method: 'GET',    path: '/v1/status',  status: 503, duration: '5ms',   remote: '203.0.113.4' },
];

export const METRICS = {
    totalReqs: 2350241, totalErrors: 3258, activeBackends: 11,
    avgP99Ms: 62, rps: 48.3, uptime: '99.86%',
    goroutines: 84, memRss: '42 MB', cpuPercent: 3.2,
    version: 'v1.4.2', build: 'b20250318',
};

export const SETTINGS = {
    nodeId: 'node-1a2b3c', hostname: 'agbero-prod-01',
    pid: 12844, startTime: '2025-03-01T00:00:00Z',
    logLevel: 'info', httpPort: '80', httpsPort: '443',
};

// Returns slightly varied metrics each call — simulates live data
let _tick = 0;
export function getLiveMetrics() {
    _tick++;
    return {
        ...METRICS,
        rps:        +(METRICS.rps + (Math.random() - 0.5) * 8).toFixed(1),
        cpuPercent: +(METRICS.cpuPercent + (Math.random() - 0.5) * 1.5).toFixed(1),
        totalReqs:  METRICS.totalReqs + _tick * 48,
        goroutines: METRICS.goroutines + Math.floor(Math.random() * 4 - 2),
        timestamp:  Date.now(),
    };
}