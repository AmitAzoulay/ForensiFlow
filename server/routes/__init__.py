from .chat import create_blueprint as _chat_bp
from .investigations import create_blueprint as _investigations_bp
from .reports import create_blueprint as _reports_bp
from .translate import create_blueprint as _translate_bp


def register_routes(app, db_client):
    app.register_blueprint(_investigations_bp(db_client))
    app.register_blueprint(_chat_bp(db_client))
    app.register_blueprint(_reports_bp())
    app.register_blueprint(_translate_bp())
