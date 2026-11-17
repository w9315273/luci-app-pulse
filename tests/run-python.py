from pathlib import Path
import sys
import unittest


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
    result = unittest.TextTestRunner(resultclass=ChineseResult, verbosity=2).run(suite)
    if result.wasSuccessful():
        print(f'Python 回归测试完成: {result.testsRun} 项全部通过.', flush=True)
    else:
        print(f'Python 回归测试失败: {len(result.failures)} 项断言失败, {len(result.errors)} 项错误.', flush=True)
    sys.exit(0 if result.wasSuccessful() else 1)
