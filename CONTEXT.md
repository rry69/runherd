# CONTEXT

## Glossary

| Istilah | Definisi |
|---|---|
| Session | Unit percakapan dengan atribut id, parent_id, directory, title, dan time_updated. |
| Primary Agent | Agen utama bertipe build / plan dengan mode primary. |
| Subagent | Agen turunan bertipe explore / general / explorer dengan mode subagent, parent_id merujuk ke sesi parent. |
| Thinking / Running | Status aktif jika part.data.state.status=running atau stream terbaru bersifat aktif, selain itu idle. |
| Directory Filter | Filter cakupan semua project, default ke directory aktif. |

