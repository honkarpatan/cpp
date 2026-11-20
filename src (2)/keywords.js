// src/keywords.js

export const keywords = [
  "auto", "break", "case", "char", "const", "continue", "default", "do",
  "double", "else", "enum", "extern", "float", "for", "goto", "if",
  "inline", "int", "long", "register", "restrict", "return", "short",
  "signed", "sizeof", "static", "struct", "switch", "typedef", "union",
  "unsigned", "void", "volatile", "while",
  // C++ specific
  "class", "public", "private", "protected", "new", "delete", "this",
  "friend", "virtual", "namespace", "using", "template", "typename",
  "try", "catch", "throw", "const_cast", "dynamic_cast", "reinterpret_cast",
  "static_cast", "bool", "true", "false", "nullptr", "operator",
  // Common includes (without .h/.cpp) - Note: Autocompleting includes might be better handled differently later
  "iostream", "vector", "string", "cmath", "cstdio", "cstdlib", "map", "set",
  // Preprocessor directives
  "include", "define", "ifdef", "ifndef", "endif", "pragma"
];