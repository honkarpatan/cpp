// // src/headerMap.js

// export const headerMap = {
//     // stdio.h (C) / cstdio (C++)
//     'printf': '<stdio.h>',
//     'scanf': '<stdio.h>',
//     'fprintf': '<stdio.h>',
//     'sprintf': '<stdio.h>',
//     'fopen': '<stdio.h>',
//     'fclose': '<stdio.h>',
//     'FILE': '<stdio.h>',
//     'getchar': '<stdio.h>',
//     'putchar': '<stdio.h>',
//     'puts': '<stdio.h>',
//     'remove': '<stdio.h>',
//     'rename': '<stdio.h>',

//     // string.h (C) / cstring (C++)
//     'strcpy': '<string.h>',
//     'strncpy': '<string.h>',
//     'strcat': '<string.h>',
//     'strncat': '<string.h>',
//     'strcmp': '<string.h>',
//     'strncmp': '<string.h>',
//     'strlen': '<string.h>',
//     'strchr': '<string.h>',
//     'strstr': '<string.h>',
//     'memcpy': '<string.h>',
//     'memset': '<string.h>',

//     // stdlib.h (C) / cstdlib (C++)
//     'malloc': '<stdlib.h>',
//     'calloc': '<stdlib.h>',
//     'realloc': '<stdlib.h>',
//     'free': '<stdlib.h>',
//     'exit': '<stdlib.h>',
//     'abort': '<stdlib.h>',
//     'system': '<stdlib.h>',
//     'atoi': '<stdlib.h>',
//     'atof': '<stdlib.h>',
//     'rand': '<stdlib.h>',
//     'srand': '<stdlib.h>',
//     'abs': '<stdlib.h>', // Also in <cmath>

//     // C++ Headers
//     'vector': '<vector>',
//     'string': '<string>', // C++ string class
//     'map': '<map>',
//     'set': '<set>',
//     'unordered_map': '<unordered_map>',
//     'unordered_set': '<unordered_set>',
//     'list': '<list>',
//     'deque': '<deque>',
//     'stack': '<stack>',
//     'queue': '<queue>',
//     'priority_queue': '<queue>',
//     'algorithm': '<algorithm>', // for std::sort, std::find etc.
//     'iostream': '<iostream>',
//     'fstream': '<fstream>',
//     'sstream': '<sstream>',
//     'iomanip': '<iomanip>', // for std::setprecision etc.
//     'cmath': '<cmath>',     // for std::abs, std::pow, trig functions etc.
//     'numeric': '<numeric>', // for std::accumulate
//     'utility': '<utility>', // for std::pair, std::move
//     'memory': '<memory>',   // for std::unique_ptr, std::shared_ptr

//     // std:: functions explicitly (requires context check)
//     'std::vector': '<vector>',
//     'std::string': '<string>',
//     'std::map': '<map>',
//     'std::set': '<set>',
//     'std::cout': '<iostream>',
//     'std::cin': '<iostream>',
//     'std::endl': '<iostream>',
//     'std::sort': '<algorithm>',
//     'std::find': '<algorithm>',
//     'std::abs': '<cmath>', // or <stdlib.h>
//     'std::pow': '<cmath>',
//     'std::unique_ptr': '<memory>',
//     'std::shared_ptr': '<memory>',
//     'std::pair': '<utility>',
//     'std::move': '<utility>',

//     // Add more mappings as needed...
// };


// src/headerMap.js

// export const headerMap = {
//     /* ---------------- C STANDARD LIBRARY ---------------- */

//     // stdio.h
//     'printf': '<stdio.h>', 'scanf': '<stdio.h>', 'fprintf': '<stdio.h>', 'sprintf': '<stdio.h>',
//     'fopen': '<stdio.h>', 'fclose': '<stdio.h>', 'fread': '<stdio.h>', 'fwrite': '<stdio.h>',
//     'fseek': '<stdio.h>', 'ftell': '<stdio.h>', 'rewind': '<stdio.h>', 'getchar': '<stdio.h>',
//     'putchar': '<stdio.h>', 'puts': '<stdio.h>', 'gets': '<stdio.h>', 'perror': '<stdio.h>',
//     'FILE': '<stdio.h>', 'remove': '<stdio.h>', 'rename': '<stdio.h>',

//     // stdlib.h
//     'malloc': '<stdlib.h>', 'calloc': '<stdlib.h>', 'realloc': '<stdlib.h>', 'free': '<stdlib.h>',
//     'exit': '<stdlib.h>', 'abort': '<stdlib.h>', 'system': '<stdlib.h>', 'atoi': '<stdlib.h>',
//     'atof': '<stdlib.h>', 'atol': '<stdlib.h>', 'rand': '<stdlib.h>', 'srand': '<stdlib.h>',
//     'abs': '<stdlib.h>', 'labs': '<stdlib.h>', 'div': '<stdlib.h>', 'ldiv': '<stdlib.h>',

//     // string.h
//     'strcpy': '<string.h>', 'strncpy': '<string.h>', 'strcat': '<string.h>', 'strncat': '<string.h>',
//     'strcmp': '<string.h>', 'strncmp': '<string.h>', 'strlen': '<string.h>', 'strchr': '<string.h>',
//     'strrchr': '<string.h>', 'strstr': '<string.h>', 'memcpy': '<string.h>', 'memmove': '<string.h>',
//     'memset': '<string.h>', 'memcmp': '<string.h>',

//     // math.h / cmath
//     'sin': '<math.h>', 'cos': '<math.h>', 'tan': '<math.h>', 'asin': '<math.h>', 'acos': '<math.h>',
//     'atan': '<math.h>', 'atan2': '<math.h>', 'sqrt': '<math.h>', 'pow': '<math.h>', 'exp': '<math.h>',
//     'log': '<math.h>', 'log10': '<math.h>', 'ceil': '<math.h>', 'floor': '<math.h>', 'fabs': '<math.h>',
//     'fmod': '<math.h>', 'modf': '<math.h>', 'hypot': '<math.h>',

//     // time.h
//     'time': '<time.h>', 'clock': '<time.h>', 'difftime': '<time.h>', 'mktime': '<time.h>',
//     'asctime': '<time.h>', 'ctime': '<time.h>', 'gmtime': '<time.h>', 'localtime': '<time.h>',
//     'strftime': '<time.h>', 'struct tm': '<time.h>',

//     // ctype.h
//     'isalpha': '<ctype.h>', 'isdigit': '<ctype.h>', 'isalnum': '<ctype.h>', 'isupper': '<ctype.h>',
//     'islower': '<ctype.h>', 'toupper': '<ctype.h>', 'tolower': '<ctype.h>', 'isspace': '<ctype.h>',
//     'ispunct': '<ctype.h>',

//     // assert.h
//     'assert': '<assert.h>',

//     // errno.h
//     'errno': '<errno.h>', 'perror': '<errno.h>', 'strerror': '<string.h>',

//     // signal.h
//     'signal': '<signal.h>', 'raise': '<signal.h>',

//     // limits.h & float.h
//     'INT_MAX': '<limits.h>', 'INT_MIN': '<limits.h>', 'CHAR_MAX': '<limits.h>', 'FLT_MAX': '<float.h>',

//     // locale.h
//     'setlocale': '<locale.h>', 'localeconv': '<locale.h>',

//     /* ---------------- C++ STANDARD LIBRARY ---------------- */

//     // iostream, fstream, sstream
//     'cout': '<iostream>', 'cin': '<iostream>', 'cerr': '<iostream>', 'clog': '<iostream>', 'endl': '<iostream>',
//     'ifstream': '<fstream>', 'ofstream': '<fstream>', 'fstream': '<fstream>',
//     'stringstream': '<sstream>', 'istringstream': '<sstream>', 'ostringstream': '<sstream>',

//     // containers
//     'vector': '<vector>', 'deque': '<deque>', 'list': '<list>', 'forward_list': '<forward_list>',
//     'map': '<map>', 'multimap': '<map>', 'set': '<set>', 'multiset': '<set>',
//     'unordered_map': '<unordered_map>', 'unordered_set': '<unordered_set>',
//     'queue': '<queue>', 'priority_queue': '<queue>', 'stack': '<stack>', 'bitset': '<bitset>',

//     // utilities & algorithm
//     'pair': '<utility>', 'make_pair': '<utility>', 'move': '<utility>', 'swap': '<utility>',
//     'tuple': '<tuple>', 'make_tuple': '<tuple>', 'tie': '<tuple>', 'sort': '<algorithm>',
//     'find': '<algorithm>', 'count': '<algorithm>', 'for_each': '<algorithm>', 'max': '<algorithm>',
//     'min': '<algorithm>', 'reverse': '<algorithm>', 'accumulate': '<numeric>',
//     'copy': '<algorithm>', 'fill': '<algorithm>', 'transform': '<algorithm>',

//     // numeric, cmath, iomanip
//     'pow': '<cmath>', 'sqrt': '<cmath>', 'abs': '<cmath>', 'fabs': '<cmath>', 'ceil': '<cmath>',
//     'floor': '<cmath>', 'round': '<cmath>', 'trunc': '<cmath>', 'log': '<cmath>', 'exp': '<cmath>',
//     'setprecision': '<iomanip>', 'setw': '<iomanip>', 'setfill': '<iomanip>',

//     // string, memory, optional, variant
//     'string': '<string>', 'wstring': '<string>',
//     'unique_ptr': '<memory>', 'shared_ptr': '<memory>', 'weak_ptr': '<memory>',
//     'make_unique': '<memory>', 'make_shared': '<memory>',
//     'optional': '<optional>', 'variant': '<variant>', 'any': '<any>', 'function': '<functional>',

//     // threading & time
//     'thread': '<thread>', 'mutex': '<mutex>', 'lock_guard': '<mutex>', 'unique_lock': '<mutex>',
//     'condition_variable': '<condition_variable>', 'future': '<future>', 'promise': '<future>',
//     'this_thread': '<thread>', 'sleep_for': '<chrono>', 'sleep_until': '<chrono>',
//     'chrono': '<chrono>', 'time_point': '<chrono>',

//     // filesystem
//     'filesystem': '<filesystem>', 'path': '<filesystem>', 'directory_iterator': '<filesystem>',

//     // exception & typeinfo
//     'exception': '<exception>', 'runtime_error': '<stdexcept>', 'logic_error': '<stdexcept>',
//     'out_of_range': '<stdexcept>', 'bad_alloc': '<new>', 'typeid': '<typeinfo>',

//     // random
//     'random_device': '<random>', 'mt19937': '<random>', 'uniform_int_distribution': '<random>',
//     'uniform_real_distribution': '<random>',

//     // regex
//     'regex': '<regex>', 'smatch': '<regex>', 'regex_match': '<regex>', 'regex_search': '<regex>',

//     // filesystem, iomanip, locale, etc.
//     'locale': '<locale>', 'codecvt': '<locale>',
//     'ios': '<ios>', 'ios_base': '<ios>', 'istream': '<istream>', 'ostream': '<ostream>',

//     // std:: scoped versions
//     'std::cout': '<iostream>', 'std::cin': '<iostream>', 'std::endl': '<iostream>',
//     'std::sort': '<algorithm>', 'std::find': '<algorithm>', 'std::pair': '<utility>',
//     'std::vector': '<vector>', 'std::map': '<map>', 'std::set': '<set>', 'std::move': '<utility>',
//     'std::unique_ptr': '<memory>', 'std::shared_ptr': '<memory>', 'std::optional': '<optional>',
//     'std::thread': '<thread>', 'std::chrono': '<chrono>', 'std::filesystem': '<filesystem>',
//     'std::regex': '<regex>', 'std::string': '<string>',
// };



// src/headerMap.js

// export const headerMap = {
//     // stdio.h (C) / cstdio (C++)
//     'printf': '<stdio.h>',
//     'scanf': '<stdio.h>',
//     'fprintf': '<stdio.h>',
//     'sprintf': '<stdio.h>',
//     'fopen': '<stdio.h>',
//     'fclose': '<stdio.h>',
//     'FILE': '<stdio.h>',
//     'getchar': '<stdio.h>',
//     'putchar': '<stdio.h>',
//     'puts': '<stdio.h>',
//     'remove': '<stdio.h>',
//     'rename': '<stdio.h>',

//     // string.h (C) / cstring (C++)
//     'strcpy': '<string.h>',
//     'strncpy': '<string.h>',
//     'strcat': '<string.h>',
//     'strncat': '<string.h>',
//     'strcmp': '<string.h>',
//     'strncmp': '<string.h>',
//     'strlen': '<string.h>',
//     'strchr': '<string.h>',
//     'strstr': '<string.h>',
//     'memcpy': '<string.h>',
//     'memset': '<string.h>',

//     // stdlib.h (C) / cstdlib (C++)
//     'malloc': '<stdlib.h>',
//     'calloc': '<stdlib.h>',
//     'realloc': '<stdlib.h>',
//     'free': '<stdlib.h>',
//     'exit': '<stdlib.h>',
//     'abort': '<stdlib.h>',
//     'system': '<stdlib.h>',
//     'atoi': '<stdlib.h>',
//     'atof': '<stdlib.h>',
//     'rand': '<stdlib.h>',
//     'srand': '<stdlib.h>',
//     'abs': '<stdlib.h>', // Also in <cmath>

//     // C++ Headers
//     'vector': '<vector>',
//     'string': '<string>', // C++ string class
//     'map': '<map>',
//     'set': '<set>',
//     'unordered_map': '<unordered_map>',
//     'unordered_set': '<unordered_set>',
//     'list': '<list>',
//     'deque': '<deque>',
//     'stack': '<stack>',
//     'queue': '<queue>',
//     'priority_queue': '<queue>',
//     'algorithm': '<algorithm>', // for std::sort, std::find etc.
//     'iostream': '<iostream>',
//     'fstream': '<fstream>',
//     'sstream': '<sstream>',
//     'iomanip': '<iomanip>', // for std::setprecision etc.
//     'cmath': '<cmath>',     // for std::abs, std::pow, trig functions etc.
//     'numeric': '<numeric>', // for std::accumulate
//     'utility': '<utility>', // for std::pair, std::move
//     'memory': '<memory>',   // for std::unique_ptr, std::shared_ptr

//     // --- [!!!] START: FIX [!!!] ---
//     // 'using namespace std;' ব্যবহারকারীদের জন্য
//     'cout': '<iostream>',
//     'cin': '<iostream>',
//     'endl': '<iostream>',
//     'sort': '<algorithm>',
//     'find': '<algorithm>',
//     'pow': '<cmath>',
//     'unique_ptr': '<memory>',
//     'shared_ptr': '<memory>',
//     'pair': '<utility>',
//     'move': '<utility>',
//     // --- [!!!] END: FIX [!!!] ---

//     // std:: functions explicitly (requires context check)
//     'std::vector': '<vector>',
//     'std::string': '<string>',
//     'std::map': '<map>',
//     'std::set': '<set>',
//     'std::cout': '<iostream>',
//     'std::cin': '<iostream>',
//     'std::endl': '<iostream>',
//     'std::sort': '<algorithm>',
//     'std::find': '<algorithm>',
//     'std::abs': '<cmath>', // or <stdlib.h>
//     'std::pow': '<cmath>',
//     'std::unique_ptr': '<memory>',
//     'std::shared_ptr': '<memory>',
//     'std::pair': '<utility>',
//     'std::move': '<utility>',
// };


// src/headerMap.js

export const headerMap = {
    /* ---------------- C STANDARD LIBRARY ---------------- */

    // stdio.h
    'printf': '<stdio.h>', 'scanf': '<stdio.h>', 'fprintf': '<stdio.h>', 'sprintf': '<stdio.h>',
    'fopen': '<stdio.h>', 'fclose': '<stdio.h>', 'fread': '<stdio.h>', 'fwrite': '<stdio.h>',
    'fseek': '<stdio.h>', 'ftell': '<stdio.h>', 'rewind': '<stdio.h>', 'getchar': '<stdio.h>',
    'putchar': '<stdio.h>', 'puts': '<stdio.h>', 'gets': '<stdio.h>', 'perror': '<stdio.h>',
    'FILE': '<stdio.h>', 'remove': '<stdio.h>', 'rename': '<stdio.h>',

    // stdlib.h
    'malloc': '<stdlib.h>', 'calloc': '<stdlib.h>', 'realloc': '<stdlib.h>', 'free': '<stdlib.h>',
    'exit': '<stdlib.h>', 'abort': '<stdlib.h>', 'system': '<stdlib.h>', 'atoi': '<stdlib.h>',
    'atof': '<stdlib.h>', 'atol': '<stdlib.h>', 'rand': '<stdlib.h>', 'srand': '<stdlib.h>',
    'abs': '<stdlib.h>', 'labs': '<stdlib.h>', 'div': '<stdlib.h>', 'ldiv': '<stdlib.h>',

    // string.h
    'strcpy': '<string.h>', 'strncpy': '<string.h>', 'strcat': '<string.h>', 'strncat': '<string.h>',
    'strcmp': '<string.h>', 'strncmp': '<string.h>', 'strlen': '<string.h>', 'strchr': '<string.h>',
    'strrchr': '<string.h>', 'strstr': '<string.h>', 'memcpy': '<string.h>', 'memmove': '<string.h>',
    'memset': '<string.h>', 'memcmp': '<string.h>',

    // math.h / cmath
    'sin': '<math.h>', 'cos': '<math.h>', 'tan': '<math.h>', 'asin': '<math.h>', 'acos': '<math.h>',
    'atan': '<math.h>', 'atan2': '<math.h>', 'sqrt': '<math.h>', 'pow': '<math.h>', 'exp': '<math.h>',
    'log': '<math.h>', 'log10': '<math.h>', 'ceil': '<math.h>', 'floor': '<math.h>', 'fabs': '<math.h>',
    'fmod': '<math.h>', 'modf': '<math.h>', 'hypot': '<math.h>',

    // time.h
    'time': '<time.h>', 'clock': '<time.h>', 'difftime': '<time.h>', 'mktime': '<time.h>',
    'asctime': '<time.h>', 'ctime': '<time.h>', 'gmtime': '<time.h>', 'localtime': '<time.h>',
    'strftime': '<time.h>', 'struct tm': '<time.h>',

    // ctype.h
    'isalpha': '<ctype.h>', 'isdigit': '<ctype.h>', 'isalnum': '<ctype.h>', 'isupper': '<ctype.h>',
    'islower': '<ctype.h>', 'toupper': '<ctype.h>', 'tolower': '<ctype.h>', 'isspace': '<ctype.h>',
    'ispunct': '<ctype.h>',

    // assert.h
    'assert': '<assert.h>',

    // errno.h
    'errno': '<errno.h>', 'perror': '<errno.h>', 'strerror': '<string.h>',

    // signal.h
    'signal': '<signal.h>', 'raise': '<signal.h>',

    // limits.h & float.h
    'INT_MAX': '<limits.h>', 'INT_MIN': '<limits.h>', 'CHAR_MAX': '<limits.h>', 'FLT_MAX': '<float.h>',

    // locale.h
    'setlocale': '<locale.h>', 'localeconv': '<locale.h>',

    /* ---------------- C++ STANDARD LIBRARY ---------------- */

    // iostream, fstream, sstream
    'cout': '<iostream>', 'cin': '<iostream>', 'cerr': '<iostream>', 'clog': '<iostream>', 'endl': '<iostream>',
    'ifstream': '<fstream>', 'ofstream': '<fstream>', 'fstream': '<fstream>',
    'stringstream': '<sstream>', 'istringstream': '<sstream>', 'ostringstream': '<sstream>',

    // containers
    'vector': '<vector>', 'deque': '<deque>', 'list': '<list>', 'forward_list': '<forward_list>',
    'map': '<map>', 'multimap': '<map>', 'set': '<set>', 'multiset': '<set>',
    'unordered_map': '<unordered_map>', 'unordered_set': '<unordered_set>',
    'queue': '<queue>', 'priority_queue': '<queue>', 'stack': '<stack>', 'bitset': '<bitset>',

    // utilities & algorithm
    'pair': '<utility>', 'make_pair': '<utility>', 'move': '<utility>', 'swap': '<utility>',
    'tuple': '<tuple>', 'make_tuple': '<tuple>', 'tie': '<tuple>', 'sort': '<algorithm>',
    'find': '<algorithm>', 'count': '<algorithm>', 'for_each': '<algorithm>', 'max': '<algorithm>',
    'min': '<algorithm>', 'reverse': '<algorithm>', 'accumulate': '<numeric>',
    'copy': '<algorithm>', 'fill': '<algorithm>', 'transform': '<algorithm>',

    // numeric, cmath, iomanip
    'pow': '<cmath>', 'sqrt': '<cmath>', 'abs': '<cmath>', 'fabs': '<cmath>', 'ceil': '<cmath>',
    'floor': '<cmath>', 'round': '<cmath>', 'trunc': '<cmath>', 'log': '<cmath>', 'exp': '<cmath>',
    'setprecision': '<iomanip>', 'setw': '<iomanip>', 'setfill': '<iomanip>',

    // string, memory, optional, variant
    'string': '<string>', 'wstring': '<string>',
    'unique_ptr': '<memory>', 'shared_ptr': '<memory>', 'weak_ptr': '<memory>',
    'make_unique': '<memory>', 'make_shared': '<memory>',
    'optional': '<optional>', 'variant': '<variant>', 'any': '<any>', 'function': '<functional>',

    // threading & time
    'thread': '<thread>', 'mutex': '<mutex>', 'lock_guard': '<mutex>', 'unique_lock': '<mutex>',
    'condition_variable': '<condition_variable>', 'future': '<future>', 'promise': '<future>',
    'this_thread': '<thread>', 'sleep_for': '<chrono>', 'sleep_until': '<chrono>',
    'chrono': '<chrono>', 'time_point': '<chrono>',

    // filesystem
    'filesystem': '<filesystem>', 'path': '<filesystem>', 'directory_iterator': '<filesystem>',

    // exception & typeinfo
    'exception': '<exception>', 'runtime_error': '<stdexcept>', 'logic_error': '<stdexcept>',
    'out_of_range': '<stdexcept>', 'bad_alloc': '<new>', 'typeid': '<typeinfo>',

    // random
    'random_device': '<random>', 'mt19937': '<random>', 'uniform_int_distribution': '<random>',
    'uniform_real_distribution': '<random>',

    // regex
    'regex': '<regex>', 'smatch': '<regex>', 'regex_match': '<regex>', 'regex_search': '<regex>',

    // filesystem, iomanip, locale, etc.
    'locale': '<locale>', 'codecvt': '<locale>',
    'ios': '<ios>', 'ios_base': '<ios>', 'istream': '<istream>', 'ostream': '<ostream>',

    // std:: scoped versions
    'std::cout': '<iostream>', 'std::cin': '<iostream>', 'std::endl': '<iostream>',
    'std::sort': '<algorithm>', 'std::find': '<algorithm>', 'std::pair': '<utility>',
    'std::vector': '<vector>', 'std::map': '<map>', 'std::set': '<set>', 'std::move': '<utility>',
    'std::unique_ptr': '<memory>', 'std::shared_ptr': '<memory>', 'std::optional': '<optional>',
    'std::thread': '<thread>', 'std::chrono': '<chrono>', 'std::filesystem': '<filesystem>',
    'std::regex': '<regex>', 'std::string': '<string>',
};

