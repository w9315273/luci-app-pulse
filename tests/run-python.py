from pathlib import Path
import re
import sys
import unittest


class TimingStream:
    def __init__(self, stream):
        self.stream = stream

    def write(self, text):
        # 仅格式化汇总行, 不改变断言失败时的原始数值.
        text = re.sub(r'^(Ran \d+ tests? in )(\d+(?:\.\d+)?)s$',
                      lambda match: f'{match[1]}{float(match[2]):.2f}s', text, flags=re.M)
        return self.stream.write(text)

    def __getattr__(self, name):
        return getattr(self.stream, name)


class ChineseResult(unittest.TextTestResult):
    def getDescription(self, test):
        description = test.shortDescription() or str(test)
        # 失败的子用例保留参数, 便于定位具体的标签或校验值.
        parameters = getattr(test, 'params', None)
        if parameters:
            description += f' {dict(parameters)!r}'
        return description


if __name__ == '__main__':
    suite = unittest.defaultTestLoader.discover(str(Path(__file__).resolve().parent), pattern='test_*.py')
    result = unittest.TextTestRunner(stream=TimingStream(sys.stderr), resultclass=ChineseResult, verbosity=2).run(suite)
    if result.wasSuccessful():
        print(f'Python 回归测试完成: {result.testsRun} 项全部通过.', flush=True)
    else:
        print(f'Python 回归测试失败: {len(result.failures)} 项断言失败, {len(result.errors)} 项错误.', flush=True)
    sys.exit(0 if result.wasSuccessful() else 1)
