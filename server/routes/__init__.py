from .chat import create_blueprint as _chat_bp
from .evtx import create_blueprint as _evtx_bp
from .handlers import create_blueprint as _handlers_bp
from .investigations import create_blueprint as _investigations_bp
from .reports import create_blueprint as _reports_bp
from .translate import create_blueprint as _translate_bp


def register_routes(app, db_client):
    app.register_blueprint(_investigations_bp(db_client))
    app.register_blueprint(_evtx_bp(db_client))
    app.register_blueprint(_chat_bp(db_client))
    app.register_blueprint(_handlers_bp())
    app.register_blueprint(_reports_bp())
    app.register_blueprint(_translate_bp())
