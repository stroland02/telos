(function_definition name: (identifier) @function.name) @function.def
(class_definition name: (identifier) @class.name) @class.def
(call (identifier) @call.name) @call.site
(import_from_statement module_name: (dotted_name) @import.source) @import.site
(import_statement name: (dotted_name) @import.source) @import.site
