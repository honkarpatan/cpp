// src/snippets.js

// --- Snippets common to both C and C++ ---
export const commonSnippets = [
  {
    caption: "main",
    snippet: `int main() {
    \${1:/* code */}
    return 0;
}`,
    meta: "snippet"
  },
  {
    caption: "for",
    snippet: `for (int \${1:i} = 0; \${1:i} < \${2:count}; \${1:i}++) {
    \${3:/* code */}
}`,
    meta: "snippet"
  },
  {
    caption: "if",
    snippet: `if (\${1:condition}) {
    \${2:/* code */}
}`,
    meta: "snippet"
  },
  {
    caption: "ifelse",
    snippet: `if (\${1:condition}) {
    \${2:/* code */}
} else {
    \${3:/* code */}
}`,
    meta: "snippet"
  },
  {
    caption: "while",
    snippet: `while (\${1:condition}) {
    \${2:/* code */}
}`,
    meta: "snippet"
  },
  {
    caption: "struct",
    snippet: `struct \${1:MyStruct} {
    \${2:/* data */}
};`,
    meta: "snippet"
  },
  {
    caption: "include",
    snippet: `#include <\${1:header}>`,
    meta: "snippet"
  },
  {
    caption: "define",
    snippet: `#define \${1:MACRO} \${2:value}`,
    meta: "snippet"
  },
  {
    caption: "dowhile",
    snippet: `do {
    \${1:/* code */}
} while (\${2:condition});`,
    meta: "snippet"
  },
  {
    caption: "switch",
    snippet: `switch (\${1:variable}) {
    case \${2:value}:
        \${3:/* code */}
        break;
    default:
        \${4:/* code */}
        break;
}`,
    meta: "snippet"
  },
  {
    caption: "func",
    snippet: `\${1:void} \${2:functionName}(\${3:params}) {
    \${4:/* code */}
}`,
    meta: "snippet"
  },
  {
    caption: "ifndef",
    snippet: `#ifndef \${1:HEADER_GUARD}
#define \${1:HEADER_GUARD}

\${2:/* code */}

#endif /* \${1:HEADER_GUARD} */`,
    meta: "snippet"
  }
];

// --- C-Only Snippets ---
export const cSnippets = [
  {
    caption: "printf",
    snippet: `printf("\${1:%s}\\n", \${2:value});`,
    meta: "snippet (C)"
  },
  {
    caption: "include stdio.h",
    snippet: `#include <stdio.h>`,
    meta: "snippet (C)"
  },
  {
    caption: "include stdlib.h",
    snippet: `#include <stdlib.h>`,
    meta: "snippet (C)"
  },
  {
    caption: "scanf",
    snippet: `scanf("\${1:%d}", &\${2:variable});`,
    meta: "snippet (C)"
  },
  {
    caption: "typedef struct",
    snippet: `typedef struct \${1:MyStruct} {
    \${2:/* data */}
} \${1:MyStruct};`,
    meta: "snippet (C)"
  }
];

// --- C++-Only Snippets ---
export const cppSnippets = [
  {
    caption: "class",
    snippet: `class \${1:MyClass} {
public:
    \${1:MyClass}();
    virtual ~\${1:MyClass}();

private:
    \${2:/* data */}
};`,
    meta: "snippet (C++)"
  },
  {
    caption: "cout",
    snippet: `std::cout << \${1:value} << std::endl;`,
    meta: "snippet (C++)"
  },
  {
    caption: "cin",
    snippet: `std::cin >> \${1:variable};`,
    meta: "snippet (C++)"
  },
  {
    caption: "namespace",
    snippet: `namespace \${1:MyNamespace} {
    \${2:/* code */}
}`,
    meta: "snippet (C++)"
  },
  {
    caption: "using namespace std",
    snippet: `using namespace std;`,
    meta: "snippet (C++)"
  },
  {
    caption: "include vector",
    snippet: `#include <vector>`,
    meta: "snippet (C++)"
  },
  {
    caption: "include string",
    snippet: `#include <string>`,
    meta: "snippet (C++)"
  },
  {
    caption: "include map",
    snippet: `#include <map>`,
    meta: "snippet (C++)"
  },
  {
    caption: "include iostream",
    snippet: `#include <iostream>`,
    meta: "snippet (C++)"
  },
  {
    caption: "for range (C++)",
    snippet: `for (const auto& \${1:item} : \${2:container}) {
    \${3:/* code */}
}`,
    meta: "snippet (C++)"
  }
];