(function_declaration name: (identifier) @function.name) @function.def
(class_declaration name: (type_identifier) @class.name) @class.def
(method_definition name: (property_identifier) @method.name) @method.def
(interface_declaration name: (type_identifier) @interface.name) @interface.def
(call_expression function: (identifier) @call.name) @call.site
(import_statement source: (string) @import.source) @import.site
