from conta_tools_contabil import db
from conta_tools_contabil.api.app import create_app
from conta_tools_contabil.conf import ApiConf


def app_de_teste(*, segredo: str = "", root_path: str = ""):
    db.set_database_url("sqlite:///:memory:")
    db.criar_schema(db.get_engine())
    return create_app(ApiConf(auth_jwt_segredo=segredo, root_path=root_path))
