import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createServerClient();

  // Query workers
  const { data: workers, error: workersError } = await supabase
    .from('workers')
    .select('*')
    .returns<any[]>();

  if (workersError) {
    console.error('[API /overview] Workers query failed:', workersError.message);
    return NextResponse.json(
      { error: 'Failed to fetch workers', details: workersError.message },
      { status: 500 }
    );
  }

  const onlineWorker = workers?.find(w => w.status === 'online');

  // Query devices - count by status
  const { data: devices, error: devicesError } = await supabase
    .from('devices')
    .select('status')
    .eq('worker_id', onlineWorker?.id || '')
    .returns<any[]>();

  if (devicesError) {
    console.error('[API /overview] Devices query failed:', devicesError.message);
    return NextResponse.json(
      { error: 'Failed to fetch devices', details: devicesError.message },
      { status: 500 }
    );
  }

  const deviceCounts = {
    total: devices?.length || 0,
    online: devices?.filter(d => d.status === 'online').length || 0,
    busy: devices?.filter(d => d.status === 'busy').length || 0,
    error: devices?.filter(d => d.status === 'error').length || 0,
    offline: devices?.filter(d => ['offline', 'disconnected'].includes(d.status)).length || 0,
  };

  // Query tasks - today's stats (UTC-based cutoff)
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('status, created_at, completed_at')
    .returns<any[]>();

  if (tasksError) {
    console.error('[API /overview] Tasks query failed:', tasksError.message);
    return NextResponse.json(
      { error: 'Failed to fetch tasks', details: tasksError.message },
      { status: 500 }
    );
  }

  const taskCounts = {
    running: tasks?.filter(t => t.status === 'running').length || 0,
    pending: tasks?.filter(t => t.status === 'pending').length || 0,
    completed_today: tasks?.filter(t => t.status === 'completed' && t.completed_at && new Date(t.completed_at) >= todayUtc).length || 0,
    failed_today: tasks?.filter(t => t.status === 'failed' && t.completed_at && new Date(t.completed_at) >= todayUtc).length || 0,
  };

  // Query proxies
  const { data: proxies, error: proxiesError } = await supabase
    .from('proxies')
    .select('status, device_serial')
    .returns<any[]>();

  if (proxiesError) {
    console.error('[API /overview] Proxies query failed:', proxiesError.message);
    return NextResponse.json(
      { error: 'Failed to fetch proxies', details: proxiesError.message },
      { status: 500 }
    );
  }

  const proxyCounts = {
    total: proxies?.length || 0,
    valid: proxies?.filter(p => p.status === 'valid' || p.status === 'active').length || 0,
    invalid: proxies?.filter(p => p.status === 'invalid' || p.status === 'error').length || 0,
    unassigned: proxies?.filter(p => !p.device_serial).length || 0,
  };

  return NextResponse.json({
    worker: onlineWorker ? {
      id: onlineWorker.id,
      name: onlineWorker.hostname,
      status: onlineWorker.status,
      uptime_seconds: onlineWorker.metadata?.uptime_sec || 0,
      last_heartbeat: onlineWorker.last_heartbeat,
      ip_address: onlineWorker.metadata?.ip || null,
    } : null,
    devices: deviceCounts,
    tasks: taskCounts,
    proxies: proxyCounts,
    timestamp: new Date().toISOString(),
  });
}
