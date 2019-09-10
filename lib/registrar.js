/**
 * Registers injections points (e.g source location, type) and their associated data with
 * a contract / instrumentation target. Run during the `parse` step. This data is
 * consumed by the Injector as it modifies the source code in instrumentation's final step.
 */
class Registrar {

  constructor(){}

  /**
   * Adds injection point to injection points map
   * @param  {Object} contract instrumentation target
   * @param  {String} key      injection point `type`
   * @param  {Number} value    injection point `id`
   */
  _createInjectionPoint(contract, key, value) {
    (contract.injectionPoints[key])
      ? contract.injectionPoints[key].push(value)
      : contract.injectionPoints[key] = [value];
  }

  /**
   * TODO - idk what this is anymore
   * @param  {Object} expression AST node
   */
  prePosition(expression) {
    if (
      expression.right.type === 'ConditionalExpression' &&
      expression.left.type === 'MemberExpression'
    ) {
      expression.range[0] -= 2;
    }
  }

  /**
   * Registers injections for statement measurements
   * @param  {Object} contract   instrumentation target
   * @param  {Object} expression AST node
   */
  statement(contract, expression) {
    const startContract = contract.instrumented.slice(0, expression.range[0]);
    const startline = ( startContract.match(/\n/g) || [] ).length + 1;
    const startcol = expression.range[0] - startContract.lastIndexOf('\n') - 1;

    const expressionContent = contract.instrumented.slice(
      expression.range[0],
      expression.range[1] + 1
    );

    const endline = startline + (contract, expressionContent.match('/\n/g') || []).length;

    let endcol;
    if (expressionContent.lastIndexOf('\n') >= 0) {

      endcol = contract.instrumented.slice(
        expressionContent.lastIndexOf('\n'),
        expression.range[1]
      ).length;

    } else endcol = startcol + (contract, expressionContent.length - 1);

    contract.statementId += 1;
    contract.statementMap[contract.statementId] = {
      start: { line: startline, column: startcol },
      end: { line: endline, column: endcol },
    };

    this._createInjectionPoint(contract, expression.range[0], {
      type: 'injectStatement', statementId: contract.statementId,
    });
  };

  /**
   * Registers injections for line measurements
   * @param  {Object} contract   instrumentation target
   * @param  {Object} expression AST node
   */
  line(contract, expression) {
    const startchar = expression.range[0];
    const endchar = expression.range[1] + 1;
    const lastNewLine = contract.instrumented.slice(0, startchar).lastIndexOf('\n');
    const nextNewLine = startchar + contract.instrumented.slice(startchar).indexOf('\n');
    const contractSnipped = contract.instrumented.slice(lastNewLine, nextNewLine);
    const restOfLine = contract.instrumented.slice(endchar, nextNewLine);

    if (
      contract.instrumented.slice(lastNewLine, startchar).trim().length === 0 &&
        (
          restOfLine.replace(';', '').trim().length === 0 ||
          restOfLine.replace(';', '').trim().substring(0, 2) === '//'
        )
       )
    {
      this._createInjectionPoint(contract, lastNewLine + 1, { type: 'injectLine' });

    } else if (
      contract.instrumented.slice(lastNewLine, startchar).replace('{', '').trim().length === 0 &&
      contract.instrumented.slice(endchar, nextNewLine).replace(/[;}]/g, '').trim().length === 0)
    {
      this._createInjectionPoint(contract, expression.range[0], { type: 'injectLine' });
    }
  };

  /**
   * Registers injections for function measurements
   * @param  {Object} contract   instrumentation target
   * @param  {Object} expression AST node
   */
  functionDeclaration(contract, expression) {
    const startContract = contract.instrumented.slice(0, expression.range[0]);
    const startline = ( startContract.match(/\n/g) || [] ).length + 1;
    const startcol = expression.range[0] - startContract.lastIndexOf('\n') - 1;

    const endlineDelta = contract.instrumented.slice(expression.range[0]).indexOf('{');
    const functionDefinition = contract.instrumented.slice(
      expression.range[0],
      expression.range[0] + endlineDelta
    );
    const endline = startline + (functionDefinition.match(/\n/g) || []).length;
    const endcol = functionDefinition.length - functionDefinition.lastIndexOf('\n');

    contract.fnId += 1;
    contract.fnMap[contract.fnId] = {
      name: expression.isConstructor ? 'constructor' : expression.name,
      line: startline,
      loc: {
        start: { line: startline, column: startcol },
        end: { line: endline, column: endcol },
      },
    };

    this._createInjectionPoint(
      contract,
      expression.range[0] + endlineDelta + 1,
      {
        type: 'injectFunction',
        fnId: contract.fnId,
      }
    );
  };

  /**
   * Registers injections for branch measurements. This generic is consumed by
   * the `assert/require` and `if` registration methods.
   * @param  {Object} contract   instrumentation target
   * @param  {Object} expression AST node
   */
  addNewBranch(contract, expression) {
    const startContract = contract.instrumented.slice(0, expression.range[0]);
    const startline = ( startContract.match(/\n/g) || [] ).length + 1;
    const startcol = expression.range[0] - startContract.lastIndexOf('\n') - 1;

    contract.branchId += 1;

    // NB locations for if branches in istanbul are zero
    // length and associated with the start of the if.
    contract.branchMap[contract.branchId] = {
      line: startline,
      type: 'if',
      locations: [{
        start: {
          line: startline, column: startcol,
        },
        end: {
          line: startline, column: startcol,
        },
      }, {
        start: {
          line: startline, column: startcol,
        },
        end: {
          line: startline, column: startcol,
        },
      }],
    };
  };

  /**
   * Registers injections for assert/require statement measurements (branches)
   * @param  {Object} contract   instrumentation target
   * @param  {Object} expression AST node
   */
  assertOrRequire(contract, expression) {
    this.addNewBranch(contract, expression);
    this._createInjectionPoint(
      contract,
      expression.range[0],
      {
        type: 'injectAssertPre',
        branchId: contract.branchId,
      }
    );
    this._createInjectionPoint(
      contract,
      expression.range[1] + 2,
      {
        type: 'injectAssertPost',
        branchId: contract.branchId,
      }
    );
  };

  /**
   * Registers injections for if statement measurements (branches)
   * @param  {Object} contract   instrumentation target
   * @param  {Object} expression AST node
   */
  ifStatement(contract, expression) {
    this.addNewBranch(contract, expression);

    if (expression.trueBody.type === 'Block') {
      this._createInjectionPoint(
        contract,
        expression.trueBody.range[0] + 1,
        {
          type: 'injectBranch',
          branchId: contract.branchId,
          locationIdx: 0,
        }
      );
    }

    if (expression.falseBody && expression.falseBody.type === 'IfStatement') {

      // Do nothing - we must be pre-preprocessing

    } else if (expression.falseBody && expression.falseBody.type === 'Block') {
      this._createInjectionPoint(
        contract,
        expression.falseBody.range[0] + 1,
        {
          type: 'injectBranch',
          branchId: contract.branchId,
          locationIdx: 1,
        }
      );
    } else {
      this._createInjectionPoint(
        contract,
        expression.trueBody.range[1] + 1,
        {
          type: 'injectEmptyBranch',
          branchId: contract.branchId,
          locationIdx: 1,
        }
      );
    }
  }
}

module.exports = Registrar;