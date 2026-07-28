import datetime
import io
import logging

import pandas as pd
from flask import Blueprint, jsonify, request, send_file

from services.ai_agent import generate_report_narrative

logger = logging.getLogger(__name__)


def create_blueprint():
    bp = Blueprint('reports', __name__)

    @bp.route('/api/generate-forensic-report', methods=['POST'])
    def generate_forensic_report():
        try:
            data = request.json
            red_nodes = data.get('nodes', [])
            red_links = data.get('links', [])
            analyst_notes = (data.get('analyst_notes') or '').strip()

            node_map = {
                n.get('id'): (n.get('properties', {}).get('name') or n.get('name') or n.get('id'))
                for n in red_nodes
            }

            evidence_list = []
            for link in red_links:
                src_id = link['source']['id'] if isinstance(link.get('source'), dict) else link.get('source')
                tgt_id = link['target']['id'] if isinstance(link.get('target'), dict) else link.get('target')
                details = link.get('details', {})
                evidence_list.append({
                    "Timestamp": details.get('timestamp') or details.get('System', {}).get('TimeCreated', {}).get('SystemTime') or "Unknown Time",
                    "Source Entity": node_map.get(src_id, str(src_id)),
                    "Action/Type": link.get('type'),
                    "Target Entity": node_map.get(tgt_id, str(tgt_id)),
                    "Event ID": details.get('event_id') or details.get('EventID') or link.get('type'),
                })

            evidence_list.sort(key=lambda x: str(x['Timestamp']))
            ai_narrative = generate_report_narrative(evidence_list)

            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
                workbook = writer.book

                title_format = workbook.add_format({'bold': True, 'font_size': 16, 'font_color': '#ffffff', 'bg_color': '#1e293b', 'align': 'left', 'valign': 'vcenter', 'indent': 1})
                header_format = workbook.add_format({'bold': True, 'font_size': 12, 'font_color': '#ef4444', 'bottom': 1})
                text_format = workbook.add_format({'text_wrap': True, 'valign': 'top', 'font_size': 11})
                meta_format = workbook.add_format({'bold': True, 'font_color': '#64748b', 'font_size': 10})

                ws = workbook.add_worksheet('Executive Summary')
                ws.set_column('A:A', 120)
                ws.hide_gridlines(2)

                ws.write('A1', 'ForensiFlow - Automated Incident Report', title_format)
                ws.set_row(0, 30)
                ws.write('A2', f"Generated on: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | Flagged Events: {len(evidence_list)}", meta_format)
                ws.set_row(1, 20)

                row = 4
                notes_body = analyst_notes or 'No analyst notes were added for this investigation.'
                ws.write(row, 0, "Analyst's Notes", header_format)
                ws.set_row(row, 20)
                row += 1
                ws.write(row, 0, notes_body, text_format)
                ws.set_row(row, max(30, (len(notes_body) / 100) * 18))
                row += 2

                for part in ai_narrative.split('\n\n'):
                    if "Executive Summary" in part or "Chronological Narrative" in part:
                        ws.write(row, 0, part.strip(), header_format)
                    else:
                        ws.write(row, 0, part.strip(), text_format)
                        ws.set_row(row, max(30, (len(part) / 100) * 15))
                    row += 2

                if evidence_list:
                    evidence_df = pd.DataFrame(evidence_list)
                    evidence_df.to_excel(writer, sheet_name='Raw Evidence', index=False)
                    ws_ev = writer.sheets['Raw Evidence']
                    table_header_format = workbook.add_format({'bold': True, 'bg_color': '#334155', 'font_color': 'white'})
                    for col_num, value in enumerate(evidence_df.columns.values):
                        ws_ev.write(0, col_num, value, table_header_format)
                    ws_ev.set_column('A:A', 25)
                    ws_ev.set_column('B:D', 35)
                    ws_ev.set_column('E:E', 15)
                    ws_ev.autofilter(0, 0, len(evidence_list), len(evidence_df.columns) - 1)

            output.seek(0)
            return send_file(
                output,
                mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                as_attachment=True,
                download_name="ForensiFlow_Incident_Report.xlsx",
            )

        except Exception as e:
            logger.error(f"Error generating report: {e}")
            return jsonify({"error": str(e)}), 500

    return bp
