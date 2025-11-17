export function ConnectionStatusIndicator({ health, analytics }: {
  health: any;
  analytics: any;
}) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-500';
      case 'degraded': return 'bg-yellow-500';
      case 'unhealthy': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'healthy': return 'Real-time';
      case 'degraded': return 'Slow';
      case 'unhealthy': return 'Offline';
      default: return 'Unknown';
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 rounded-full border border-gray-200">
      <div className={`w-2 h-2 rounded-full ${getStatusColor(health?.status || 'unhealthy')}`} />
      <span className="text-xs font-medium text-gray-600">
        {getStatusText(health?.status || 'unhealthy')}
      </span>
      {health?.latency && (
        <span className="text-xs text-gray-500">
          {Math.round(health.latency)}ms
        </span>
      )}
    </div>
  );
}




