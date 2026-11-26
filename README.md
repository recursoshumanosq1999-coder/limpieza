# Control de Aseo — Mdreieck S.A de C.V

App web para registrar el aseo diario por área, cerrar cada revisión con **nombre y firma dibujada** y generar al final del día un **PDF con todas las revisiones y firmas sobre la hoja membretada**.

- **Frontend:** este repositorio (HTML + CSS + JavaScript, sin dependencias). Se publica gratis en GitHub Pages.
- **Backend:** Google Apps Script (carpeta `apps-script/` del paquete). Guarda en Google Sheets, las firmas en Drive y arma el PDF con la plantilla membretada.

```
index.html          Estructura de la app y diálogo de firma
css/estilos.css     Estilos (pensada para celular)
js/config.js        URL de Apps Script y token  ← EDITAR
js/api.js           Llamadas a la API
js/firma.js         Área de firma (dedo, lápiz o mouse)
js/app.js           Pantallas: Hoy, Plan por área, Calendario, Reporte
assets/             Logotipo
```

## Puesta en marcha
1. **Primero el backend:** sigue `apps-script/IMPLEMENTACION.md` (ejecutar `setup()` y publicar como aplicación web).
2. Edita `js/config.js`:
   ```js
   API_URL:   'https://script.google.com/macros/s/AKfy…/exec',
   API_TOKEN: 'el token que mostró setup()'
   ```
3. Sube el repo a GitHub:
   ```bash
   git init
   git add .
   git commit -m "Control de aseo"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/control-aseo.git
   git push -u origin main
   ```
4. En GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save**.
   En 1–2 minutos queda en `https://TU_USUARIO.github.io/control-aseo/`.
5. En el celular abre esa dirección y usa **"Agregar a pantalla de inicio"** para tenerla como app.

> Para probar en tu computadora sin GitHub: `python3 -m http.server 8080` dentro de la carpeta y abre `http://localhost:8080`.

## Uso
| Pantalla | Quién | Qué hace |
|---|---|---|
| **Hoy** | Personal de limpieza | Lista por nivel y área de lo que toca ese día. Un toque cambia el estado: ✔ → Pendiente → N/A → sin marcar. **Cerrar revisión con firma** pide el nombre y la firma; después el área queda bloqueada. |
| **Plan por área** | Todos | Qué se limpia en cada área y qué días (L–V). Se edita en la hoja *Elementos*. |
| **Calendario** | Supervisión | Avance de cada día del mes; tocar un día abre sus revisiones. |
| **Reporte** | Supervisión | Áreas cerradas y quién las firmó. Nombre y firma de Vo.Bo. opcionales. **Generar PDF del día** arma el PDF en la hoja membretada y lo guarda en Drive (*Reportes PDF/AAAA-MM/*). |

## Seguridad
- El token protege la API, pero en un repo **público** cualquiera puede leerlo en `js/config.js`. Mejor usa un repo **privado** con Pages (requiere GitHub Pro/Team) o cambia el token con `cambiarToken()` si se filtra.
- Las firmas y los PDF quedan en tu Drive; solo los ve quien tiene acceso a la carpeta (salvo que actives `COMPARTIR_PDF_CON_LINK`).
- Reabrir un área cerrada es solo para supervisión: se hace desde Apps Script/API con el PIN (`fijarPinSupervisor()`), o borrando la fila en la hoja *Cierres*.
