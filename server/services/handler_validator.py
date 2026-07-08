import ast

_ALLOWED_FROM_IMPORTS = {
    'services.handlers._shared': {'ENTITY_RESOLVERS', '_insert_graph_relationship'},
    'services.handlers': {'register_handler'},
}

_SAFE_BUILTINS = frozenset([
    'str', 'int', 'float', 'bool', 'bytes',
    'list', 'dict', 'tuple', 'set', 'frozenset',
    'len', 'range', 'enumerate', 'zip', 'map', 'filter',
    'sorted', 'reversed', 'min', 'max', 'sum', 'abs', 'round',
    'isinstance', 'hasattr', 'callable',
    'any', 'all',
    'repr', 'chr', 'ord', 'hex', 'bin', 'oct',
    'print',
])

_SAFE_ATTR_METHODS = frozenset([
    'lower', 'upper', 'strip', 'lstrip', 'rstrip', 'title', 'capitalize',
    'startswith', 'endswith', 'replace', 'split', 'rsplit', 'splitlines',
    'join', 'format', 'format_map', 'encode', 'decode',
    'isdigit', 'isalpha', 'isalnum', 'isspace', 'isupper', 'islower',
    'count', 'find', 'rfind', 'index', 'rindex', 'zfill', 'center',
    'ljust', 'rjust', 'expandtabs', 'partition', 'rpartition',
    'get', 'keys', 'values', 'items', 'update', 'pop', 'setdefault',
    'copy', 'clear', 'popitem',
    'append', 'extend', 'insert', 'remove', 'sort', 'reverse',
    'discard', 'add', 'union', 'intersection', 'difference',
])

_KNOWN_RESOLVERS = frozenset([
    'user', 'process', 'computer', 'file', 'registry', 'service', 'task', 'group',
])


def validate_handler_ast(code: str, event_id: str | None) -> str:
    """
    Validates generated handler code against the AST whitelist.
    Returns the detected event ID string on success, raises ValueError on violation.
    """
    tree = ast.parse(code)

    defined_funcs = {node.name for node in tree.body if isinstance(node, ast.FunctionDef)}
    allowed_call_names = {'_insert_graph_relationship', 'register_handler'} | defined_funcs | _SAFE_BUILTINS

    register_calls = []

    for node in tree.body:
        if isinstance(node, ast.ImportFrom):
            module = node.module or ''
            allowed_names = _ALLOWED_FROM_IMPORTS.get(module)
            if allowed_names is None:
                raise ValueError(f"Import from disallowed module: '{module}'")
            for alias in node.names:
                if alias.name not in allowed_names:
                    raise ValueError(f"Disallowed name '{alias.name}' imported from '{module}'")
                if alias.asname is not None:
                    raise ValueError(f"Import aliases not allowed: '{alias.name} as {alias.asname}'")

        elif isinstance(node, ast.Import):
            raise ValueError("'import' statements are not allowed")

        elif isinstance(node, ast.FunctionDef):
            pass

        elif isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
            func = node.value.func
            if isinstance(func, ast.Name) and func.id == 'register_handler':
                register_calls.append(node.value)
            else:
                name = func.id if isinstance(func, ast.Name) else ast.dump(func)
                raise ValueError(f"Unexpected top-level call: '{name}'")

        else:
            raise ValueError(f"Disallowed statement at module level: {type(node).__name__}")

    if len(register_calls) != 1:
        raise ValueError(f"Expected exactly one register_handler() call, got {len(register_calls)}")

    call = register_calls[0]
    if not call.args or not isinstance(call.args[0], ast.Constant):
        raise ValueError("register_handler first argument must be a string literal event ID")
    detected_id = str(call.args[0].value)
    if not detected_id.isdigit() or not (4 <= len(detected_id) <= 5):
        raise ValueError(f"register_handler event ID must be 4-5 digits, got '{detected_id}'")
    if event_id and detected_id != event_id:
        raise ValueError(f"register_handler first argument must be '{event_id}', got '{detected_id}'")

    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name):
                if func.id not in allowed_call_names:
                    raise ValueError(f"Call to disallowed name: '{func.id}'")
            elif isinstance(func, ast.Subscript):
                if not (isinstance(func.value, ast.Name) and func.value.id == 'ENTITY_RESOLVERS'):
                    raise ValueError("Subscript calls only allowed on ENTITY_RESOLVERS")
                key = func.slice
                if not isinstance(key, ast.Constant) or key.value not in _KNOWN_RESOLVERS:
                    bad = key.value if isinstance(key, ast.Constant) else ast.dump(key)
                    raise ValueError(
                        f"Unknown resolver '{bad}'. "
                        f"Available: {', '.join(sorted(_KNOWN_RESOLVERS))}"
                    )
            elif isinstance(func, ast.Attribute):
                if func.attr not in _SAFE_ATTR_METHODS:
                    raise ValueError(f"Method call not allowed: '.{func.attr}()'")
            else:
                raise ValueError(f"Disallowed call expression: {ast.dump(func)}")

        if isinstance(node, ast.Attribute):
            if node.attr.startswith('__') and node.attr.endswith('__'):
                raise ValueError(f"Dunder attribute access not allowed: '.{node.attr}'")

    return detected_id
