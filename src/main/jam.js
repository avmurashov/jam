/**
 * @namespace
 * 
 * @description
 * This objects provides a collection of functions, suitable for JavaScript activities modeling (jam).
 * 
 * @example
 * function handleOk() {
 * 	var requestItems = [];
 * 	var responseItems = [];
 * 	var failedItems = [];
 * 	
 * 	var iterator = {
 * 		index: 0,
 * 		item: undefined
 * 	};
 * 	
 * 	jam.execute(
 * 		jam.runCleanup({
 * 			run: jam.sequence(
 * 				maskForm,
 * 				getFormItemsToProcess(requestItems),
 * 				submitProcessingRequest(requestItems, responseItems),
 * 				jam.repeat({
 * 					test: nextItem(responseItems, iterator),
 * 					run: jam.choose({
 * 						test: isSuccessfullyProcessed(iterator),
 * 						run: updateFormItem(iterator)
 * 					}, {
 * 						test: jam.always(),
 * 						run: jam.async(function () { failedItems.push(iterator.item); })
 * 					})
 * 				}),
 * 				informOnFailedItems(failedItems),
 * 				jam.always(true, submitRefreshDataRequest(failedItems))
 * 			),
 * 			cleanup: unmaskForm
 * 		})
 * 	);
 * }
 */
var jam = {
	/**
	 * @function
	 * 
	 * @description
	 * Executes provided functions in order.
	 * This function will stop further processing if the current function provides <code>false</code> as a completion
	 * callback status.
	 * 
	 * @param {Function} f
	 * Asynchronous function to execute. This function is supposed to accept exactly one parameter, which in turn
	 * represents a completion callback function.
	 * 
	 * @param {Function} [fs]
	 * Subsequent functions to execute. Should follow the same specification as <code>f</code> parameter.
	 * 
	 * @returns {Function}
	 * Asynchronous function that accepts completion callback, and hence, might be used as parameter for other
	 * {@link jam} functions to form more complex activities.
	 */
	sequence: function (f, fs) {
		var args = arguments;
		
		return function (complete) {
			var idx = 0;
			
			var execute = function () {
				if (idx < args.length) {
					var f = args[idx++];
					
					f(function (status) {
						if (status === false) {
							complete(false);
						} else {
							execute();
						}
					});
					
				} else {
					complete();
				}
			};
			
			execute();
		};
	},
	
	/**
	 * @function
	 * 
	 * @description
	 * Executes several asynchronous tasks concurrently.
	 * This function does not complete until all tasks are completed.
	 * It always return successful completion status, independently of the provided functions' completion statuses.
	 *  
	 * @param {Function} f
	 * Asynchronous function to execute. This function is supposed to accept exactly one parameter, which in turn
	 * represents a completion callback function. Completion status will be ignored.
	 * 
	 * @param {Function} [fs]
	 * Other functions to execute concurrently. Should follow the same specification as <code>f</code> parameter.
	 * 
	 * @returns {Function}
	 * Asynchronous function that accepts completion callback, and hence, might be used as parameter for other
	 * {@link jam} functions to form more complex activities.
	 */
	fork: function (f, fs) {
		var args = arguments;
		
		return function (complete) {
			var done = new Array(args.length);
			
			var allDone = function () {
				for (var i = 0; i < done.length; ++i) {
					if (!done[i]) { return false; }
				}
				
				return true;
			};
			
			var execute = function (i) {
				var f = args[i];
				
				// we are not interested in forked function completion status
				f(function () {
					done[i] = true;
					
					if (allDone()) {
						complete();
					}
				});
			};
			
			for (var i = 0; i < args.length; ++i) {
				execute(i);
			}
		};
	},
	
	/**
	 * @function
	 * 
	 * @description
	 * Iterates over the list of provided branches. This function terminates on the first executed branch.
	 * 
	 * @param {Object} b
	 * Branch object, should have the following properties:
	 * <code>test</code> - function to test whether to execute the given branch.
	 * <code>run</code> - function to run if the given branch is executed.
	 * 
	 * @param {Object} [bs]
	 * Subsequent branches to consider. Should follow the same specification as <code>b</code> parameter.
	 * 
	 * @returns {Function}
	 * Asynchronous function that accepts completion callback, and hence, might be used as parameter for other
	 * {@link jam} functions to form more complex activities.
	 */
	choose: function (b, bs) {
		var args = arguments;
		
		return function (complete) {
			var idx = 0;
			
			var execute = function () {
				if (idx < args.length) {
					var branch = args[idx++];
					
					branch.test(function (status) {
						if (status !== false) {
							branch.run(complete);
						} else {
							execute();
						}
					});
					
				} else {
					complete();
				}
			};
			
			execute();
		};
	},
	
	/**
	 * @function
	 * 
	 * @description
	 * Repeats execution of the given action until the <code>test</code> function returns <code>false</code>.
	 * 
	 * @param {Object} options
	 * Repeat options, expected to have the following properties:
	 * <code>test</code> - function to run to test whether to proceed with next iteration; <code>false</code>
	 * completion status will brake the cycle, but will NOT affect completion status of the <code>repeat</code>
	 * function.
	 * <code>run</code> - function to repeat; <code>false</code> completion status will brake the cycle and will be
	 * propagated as completion status of the <code>repeat</code> function.
	 * 
	 * @returns {Function}
	 * Asynchronous function that accepts completion callback, and hence, might be used as parameter for other
	 * {@link jam} functions to form more complex activities.
	 */
	repeat: function (options) {
		return function (complete) {
			var execute = function () {
				options.test(function (status) {
					if (status !== false) {
						options.run(function (status) {
							if (status === false) {
								complete(false);
							} else {
								execute();
							}
						});
						
					} else {
						complete();
					}
				});
			};
			
			execute();
		};
	},
	
	/**
	 * @function
	 * 
	 * @description
	 * Runs the given function and then executes cleanup.
	 * 
	 * @param {Object} options
	 * Object with the following properties:
	 * <code>run</code> - function to run;
	 * <code>cleanup</code> - cleanup function, returned completion status will be ignored.
	 * 
	 * @returns {Function}
	 * Asynchronous function that accepts completion callback, and hence, might be used as parameter for other
	 * {@link jam} functions to form more complex activities.
	 */
	runCleanup: function (options) {
		return function (complete) {
			options.run(function (status) {
				// we are not interested in cleanup completion status
				options.cleanup(function () {
					complete(status);
				});
			});
		};
	},
	
	/**
	 * @function
	 * 
	 * @description
	 * Utility function used to convert the given synchronous function into asynchronous form.
	 * 
	 * @param {Function} [f]
	 * Synchronous function to convert to asynchronous form, suitable for other {@link jam} functions.
	 * Value, returned by this function, will be propagated as a completion status.
	 * Provided function will be executed from within the <code>setTimeout</code> handler, this effectively means that
	 * the call stack will be reset.
	 * 
	 * @returns {Function}
	 * Asynchronous function that accepts completion callback, and hence, might be used as parameter for other
	 * {@link jam} functions to form more complex activities.
	 */
	async: function (f) {
		return function (complete) {
			setTimeout(function () { complete(f ? f() : true); }, 1);
		};
	},
	
	/**
	 * @function
	 * 
	 * @description
	 * Utility function that executes the optionally provided function and discards its status to return provided one.
	 * 
	 * @param {Boolean} status
	 * Completion status to return.
	 * 
	 * @param {Function} [f]
	 * Optional, function to execute; completion status will always be ignored.
	 * 
	 * @returns {Function}
	 * Asynchronous function that accepts completion callback, and hence, might be used as parameter for other
	 * {@link jam} functions to form more complex activities.
	 */
	always: function (status, f) {
		f = f || this.async();
		
		return function (complete) {
			// ignore function completion status, to always return the given one
			f(function () {
				complete(status);
			});
		};
	},
	
	/**
	 * @function
	 * 
	 * @description
	 * Executes provided {@link jam} function.
	 * 
	 * @param {Function} f
	 * {@link jam} function to execute; completion status will be ignored.
	 */
	execute: function (f) {
		f(function () {});
	}
};