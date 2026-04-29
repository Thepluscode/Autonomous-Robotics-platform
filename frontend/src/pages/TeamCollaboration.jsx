import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { taskAPI } from "../lib/api";
import { formatDateTime, getStatusColor } from "../lib/utils";
import { Users, Plus, CheckCircle, Clock, AlertCircle, Trash2 } from "lucide-react";

export default function TeamCollaboration() {
  const [tasks, setTasks] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium" });

  useEffect(() => {
    taskAPI.getAll().then(res => setTasks(res.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    try {
      await taskAPI.create(form);
      const t = await taskAPI.getAll();
      setTasks(t.data || []);
      setCreateOpen(false);
      setForm({ title: "", description: "", priority: "medium" });
    } catch {}
  };

  const handleStatusUpdate = async (id, status) => {
    try { await taskAPI.update(id, status); const t = await taskAPI.getAll(); setTasks(t.data || []); } catch {}
  };

  const handleDelete = async (id) => {
    try { await taskAPI.delete(id); setTasks(prev => prev.filter(t => t.id !== id)); } catch {}
  };

  const statusIcon = (status) => ({
    pending: <Clock className="w-4 h-4 text-amber-500" />,
    in_progress: <AlertCircle className="w-4 h-4 text-blue-500" />,
    completed: <CheckCircle className="w-4 h-4 text-emerald-500" />,
  }[status] || <Clock className="w-4 h-4" />);

  const tasksByStatus = (status) => tasks.filter(t => t.status === status);

  return (
    <div className="space-y-6" data-testid="team-page">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{tasks.length} total tasks</p>
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1" />New Task</Button>
      </div>

      <Tabs defaultValue="board">
        <TabsList><TabsTrigger value="board">Board View</TabsTrigger><TabsTrigger value="list">List View</TabsTrigger></TabsList>

        <TabsContent value="board">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {["pending", "in_progress", "completed"].map(status => (
              <div key={status} className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  {statusIcon(status)}
                  <span className="text-sm font-medium capitalize">{status.replace("_", " ")}</span>
                  <Badge variant="secondary" className="text-[10px]">{tasksByStatus(status).length}</Badge>
                </div>
                <div className="space-y-2">
                  {tasksByStatus(status).map(task => (
                    <Card key={task.id} className="cursor-pointer hover:shadow-sm transition-shadow">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start justify-between">
                          <p className="text-sm font-medium">{task.title}</p>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" onClick={() => handleDelete(task.id)}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                        {task.description && <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>}
                        <div className="flex items-center gap-2">
                          <Badge className={getStatusColor(task.priority)} style={{ fontSize: "10px" }}>{task.priority}</Badge>
                          {status !== "completed" && (
                            <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => handleStatusUpdate(task.id, status === "pending" ? "in_progress" : "completed")}>
                              {status === "pending" ? "Start" : "Complete"}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="list">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border"><th className="p-3 text-left font-medium text-muted-foreground">Task</th><th className="p-3 text-left font-medium text-muted-foreground">Priority</th><th className="p-3 text-left font-medium text-muted-foreground">Status</th><th className="p-3 text-left font-medium text-muted-foreground">Created</th><th className="p-3"></th></tr></thead>
                <tbody>
                  {tasks.map(task => (
                    <tr key={task.id} className="border-b border-border last:border-0">
                      <td className="p-3"><p className="font-medium">{task.title}</p>{task.description && <p className="text-xs text-muted-foreground">{task.description}</p>}</td>
                      <td className="p-3"><Badge className={getStatusColor(task.priority)} style={{ fontSize: "10px" }}>{task.priority}</Badge></td>
                      <td className="p-3"><Badge className={getStatusColor(task.status)} style={{ fontSize: "10px" }}>{task.status}</Badge></td>
                      <td className="p-3 text-xs text-muted-foreground">{formatDateTime(task.created_at)}</td>
                      <td className="p-3"><Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(task.id)}><Trash2 className="w-3.5 h-3.5" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Task</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Deploy sensors to Borneo..." /></div>
            <div className="space-y-2"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional details..." /></div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem><SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem><SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={handleCreate} disabled={!form.title}>Create Task</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
