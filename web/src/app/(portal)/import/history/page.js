'use client';
import { useEffect, useState } from 'react';
import Topbar from '@/components/layout/Topbar';
import DataTable from '@/components/ui/DataTable';
import Pagination from '@/components/ui/Pagination';
import api from '@/lib/api';
import { formatDate } from '@/lib/formatters';

export default function ImportHistoryPage() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/imports', { params: { page, limit: 20 } })
      .then(r => { setData(r.data.data); setTotal(r.data.total); })
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <>
      <Topbar title="Import History" />
      <DataTable
          loading={loading}
          columns={[
            { key: 'original_filename', label: 'File Name' },
            { key: 'import_type', label: 'Type', render: v => <span className="badge badge-blue">{v}</span> },
            {
              key: 'status', label: 'Status',
              render: v => <span className={`badge ${v === 'completed' ? 'badge-green' : v === 'failed' ? 'badge-red' : v === 'processing' ? 'badge-amber' : 'badge-gray'}`}>{v}</span>
            },
            { key: 'total_rows', label: 'Total', render: v => v || '—' },
            { key: 'success_rows', label: 'Success', render: v => <span style={{ color: 'var(--color-green)', fontWeight: 600 }}>{v ?? '—'}</span> },
            { key: 'error_rows', label: 'Errors', render: v => v > 0 ? <span style={{ color: 'var(--color-red)', fontWeight: 600 }}>{v}</span> : (v === 0 ? '0' : '—') },
            { key: 'created_at', label: 'Uploaded At', render: v => formatDate(v) },
            { key: 'completed_at', label: 'Completed At', render: v => v ? formatDate(v) : '—' },
          ]}
          data={data}
          emptyText="No imports yet"
          footer={<Pagination page={page} total={total} limit={20} onChange={setPage} />}
        />
    </>
  );
}
