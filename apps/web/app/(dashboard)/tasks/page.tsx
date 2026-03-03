import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { getTasksWithDetails } from "@/lib/db/tasks";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  let tasks: Awaited<ReturnType<typeof getTasksWithDetails>> = [];
  try {
    tasks = await getTasksWithDetails();
  } catch {
    // Supabase not configured or RLS at build time
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Tasks / History
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Created</TableCell>
            <TableCell>Video</TableCell>
            <TableCell>Channel</TableCell>
            <TableCell>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {tasks.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} align="center" sx={{ color: "text.secondary" }}>
                No tasks.
              </TableCell>
            </TableRow>
          )}
          {tasks.map((t) => (
            <TableRow key={t.id}>
              <TableCell sx={{ whiteSpace: "nowrap" }}>
                {t.created_at ? new Date(t.created_at).toLocaleString() : "—"}
              </TableCell>
              <TableCell>{t.videos?.title ?? t.video_id ?? "—"}</TableCell>
              <TableCell>{t.channels?.name ?? "—"}</TableCell>
              <TableCell>{t.status ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
        Total: {tasks.length}
      </Typography>
    </Box>
  );
}
