# CONTEXT

## Glossary

| Istilah | Definisi |
|---|---|
| Session | Unit percakapan dengan atribut id, parent_id, directory, title, dan time_updated. |
| Primary Agent | Agen utama bertipe build / plan dengan mode primary. |
| Subagent | Agen turunan bertipe explore / general / explorer dengan mode subagent, parent_id merujuk ke sesi parent. |
| Thinking / Running | Status aktif dari dua sinyal & dua ambang: ada part ber-status running (ambang stuck 5 menit) atau ada turn assistant yang belum punya message.data.time.completed, yaitu streaming tanpa tool (ambang 15 menit). Sinyal `live` hanya berisi key root session — turn child dilipat ke root, jadi jangan mencari turn di sesi anak. Melewati ambangnya = gagal. Tanpa sinyal: label beranda idle; di kanban label mengikuti workflow override (queued/progress/review/done). |
| Directory Filter | Filter cakupan semua project, default ke directory aktif. |

